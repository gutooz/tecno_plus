'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Save, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, IconButton, Input } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

interface Preview {
  file: File;
  url: string;
}

interface PendingProduct {
  id: string;
  url: string;
  internalSku?: string;
  saving?: boolean;
  name: string;
  purchasePrice: string;
  salePrice: string;
  weight: string;
  stock: string;
}

interface PendingApiItem {
  _id: string;
  internalSku: string;
  vision?: {
    name?: string;
    labelPrice?: number;
    weight?: number;
    quantity?: number;
  };
  images?: { original?: string };
}

interface PendingListResponse {
  items: PendingApiItem[];
  page: number;
  pages: number;
}

/**
 * Envio em Lote: sobe N fotos de uma vez, elas ficam aqui aguardando
 * título/preço (uma a uma ou todas de uma vez com "Salvar todos"). Ao salvar,
 * o produto sai desta lista e passa a existir em Produtos (de onde saem o
 * Excel e a publicação na loja). Reaproveitada por /upload e /lote.
 */
export function BatchUpload({ title = 'Envio em Lote' }: { title?: string }) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreviewUrl(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewUrl]);

  // Carrega o que já estava pendente (enviado antes, ainda sem título/preço)
  // para o Envio em Lote sobreviver a um F5 ou a voltar depois. O backend
  // limita cada página a 100 itens — pagina até acabar em vez de truncar
  // silenciosamente em 100, senão um lote maior que isso "some" da tela.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items: PendingApiItem[] = [];
        let page = 1;
        let pages = 1;
        do {
          const res = await api.get<PendingListResponse>(
            `/products?status=uploaded&limit=100&page=${page}`,
          );
          if (cancelled) return;
          items.push(...res.items);
          pages = res.pages;
          page += 1;
        } while (page <= pages);

        setPending(
          items.map((it) => ({
            id: it._id,
            url: it.images?.original ?? '',
            internalSku: it.internalSku,
            name: it.vision?.name ?? '',
            purchasePrice: it.vision?.labelPrice ? String(it.vision.labelPrice) : '',
            salePrice: '',
            weight: it.vision?.weight ? String(it.vision.weight) : '',
            stock: it.vision?.quantity != null ? String(it.vision.quantity) : '',
          })),
        );
      } catch {
        /* backend fora do ar / sem sessão — segue com a lista vazia */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPreviews((prev) => [
      ...prev,
      ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function updateField(
    id: string,
    field: 'name' | 'purchasePrice' | 'salePrice' | 'weight' | 'stock',
    value: string,
  ) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  async function startUpload() {
    if (!previews.length) return;
    setUploading(true);
    setProgress(0);

    try {
      const selected = previews;
      const res = await api.upload(
        selected.map((p) => p.file),
        setProgress,
        { deferPipeline: true },
      );

      const uploaded = res.products.map((product, index) => ({
        id: product.id,
        url: selected[index].url,
        internalSku: product.internalSku,
        name: '',
        purchasePrice: '',
        salePrice: '',
        weight: '',
        stock: '',
      }));

      setPending((prev) => [...prev, ...uploaded]);
      setPreviews([]);
    } finally {
      setUploading(false);
    }
  }

  /** Salva título/preço, dispara o pipeline e tira o item desta lista — ele
   * passa a existir como produto de verdade em /produtos. */
  async function saveOne(id: string): Promise<boolean> {
    const product = pending.find((p) => p.id === id);
    if (!product || !product.name.trim()) return false;

    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, saving: true } : p)));
    try {
      const purchasePrice = Number(product.purchasePrice.replace(',', '.'));
      const salePrice = Number(product.salePrice.replace(',', '.'));
      const weight = Number(product.weight.replace(',', '.'));
      const stock = Number(product.stock.replace(',', '.'));

      await api.put(`/products/${id}`, {
        'vision.name': product.name,
        'vision.labelPrice': Number.isFinite(purchasePrice) ? purchasePrice : 0,
        // Peso é obrigatório pela Shopee (frete) — só grava se um número > 0 foi
        // digitado; nunca inventamos um valor (chave omitida = undefined no JSON).
        'vision.weight': Number.isFinite(weight) && weight > 0 ? weight : undefined,
        // Estoque também é obrigatório na Shopee — sem isto o exportador assume 1
        // por padrão (revisável, mas raramente certo). Mesma regra: nunca inventar.
        'vision.quantity': Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : undefined,
        // GTIN vem sozinho do código de barras que a IA de visão já lê da foto
        // (vision.ean/vision.barcode) — sem campo manual aqui. Categoria idem: a
        // Shopee recomenda a categoria certa na importação a partir do
        // título/descrição; um ID "chutado" pela IA (sem a árvore real de
        // categorias da Shopee) arriscaria mandar o produto pra categoria errada.
        'pricing.purchasePrice': Number.isFinite(purchasePrice) ? purchasePrice : 0,
        'pricing.suggestedPrice': Number.isFinite(salePrice) ? salePrice : 0,
        'pricing.profit':
          Number.isFinite(purchasePrice) && Number.isFinite(salePrice)
            ? salePrice - purchasePrice
            : 0,
        'pricing.markupApplied':
          Number.isFinite(purchasePrice) && purchasePrice > 0 && Number.isFinite(salePrice)
            ? salePrice / purchasePrice - 1
            : 0,
        'pricing.marginPercent':
          Number.isFinite(salePrice) && salePrice > 0 && Number.isFinite(purchasePrice)
            ? (salePrice - purchasePrice) / salePrice
            : 0,
        'pricing.roi':
          Number.isFinite(purchasePrice) && purchasePrice > 0 && Number.isFinite(salePrice)
            ? (salePrice - purchasePrice) / purchasePrice
            : 0,
      });
      await api.post(`/products/${id}/process`);

      setPending((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (e) {
      setPending((prev) => prev.map((p) => (p.id === id ? { ...p, saving: false } : p)));
      alert(
        `Não foi possível salvar "${product.name}": ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }

  /** Remove o pendente sem publicar — some da lista e do backend. */
  async function deleteOne(id: string) {
    const product = pending.find((p) => p.id === id);
    if (!product) return;
    if (!confirm(`Excluir "${product.name || 'este item'}"? Essa ação não pode ser desfeita.`))
      return;

    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, saving: true } : p)));
    try {
      await api.del(`/products/${id}`);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setPending((prev) => prev.map((p) => (p.id === id ? { ...p, saving: false } : p)));
      alert(`Não foi possível excluir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function saveAll() {
    const fillable = pending.filter((p) => p.name.trim());
    if (!fillable.length) return;
    setSavingAll(true);
    try {
      await Promise.all(fillable.map((p) => saveOne(p.id)));
    } finally {
      setSavingAll(false);
    }
  }

  const fillableCount = pending.filter((p) => p.name.trim()).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={title}
        subtitle={
          pending.length
            ? `${pending.length} produto(s) aguardando título e preço`
            : 'Envie as fotos dos produtos — depois preencha título e preço de cada um'
        }
      />

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-44 flex-col items-center justify-center gap-3 rounded-4xl border-2 border-dashed p-8 text-center transition-all duration-200 ease-out-soft',
          dragging
            ? 'border-primary bg-primary/[0.06] scale-[1.005]'
            : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2/50',
        )}
      >
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-200 ease-out-soft',
            dragging ? 'scale-110 bg-primary/15 text-primary' : 'bg-primary/10 text-primary',
          )}
        >
          <UploadCloud size={23} />
        </div>
        <div>
          <p className="text-sm font-medium">Arraste as fotos aqui</p>
          <p className="mt-0.5 text-xs text-muted">ou selecione do seu computador</p>
        </div>
        <label>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg shadow-soft transition-all duration-200 ease-out-soft hover:shadow-md hover:brightness-[1.06] active:scale-[0.97]">
            <ImagePlus size={15} />
            Selecionar fotos
          </span>
        </label>
      </div>

      {previews.length > 0 && (
        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {previews.length} foto(s) selecionada(s)
              {uploading && <span className="nums font-medium text-primary"> — {progress}%</span>}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => setPreviews([])}
              >
                <Trash2 size={15} />
                Limpar
              </Button>
              <Button size="sm" loading={uploading} onClick={startUpload}>
                {!uploading && <UploadCloud size={15} />}
                {uploading ? 'Enviando…' : 'Enviar tudo'}
              </Button>
            </div>
          </div>

          {uploading && (
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            <AnimatePresence>
              {previews.map((p, i) => (
                <motion.div
                  key={p.url}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-border ring-1 ring-border/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {!uploading && (
                    <button
                      onClick={() => setPreviews((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100"
                      title="Remover"
                      aria-label="Remover foto"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <div className="mt-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Preencha e salve — ao salvar, o produto vai para o catálogo.
            </p>
            <Button loading={savingAll} disabled={!fillableCount} onClick={saveAll}>
              {!savingAll && <Save size={16} />}
              {savingAll ? 'Salvando…' : `Salvar todos (${fillableCount})`}
            </Button>
          </div>

          {/* Mobile: cada pendente vira um card empilhado — sem scroll lateral */}
          <div className="space-y-3 md:hidden">
            {pending.map((product) => (
              <Card key={product.id} className="space-y-3 p-3.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => product.url && setPreviewUrl(product.url)}
                    disabled={!product.url}
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border/60 transition-transform duration-150 ease-out-soft active:scale-95 disabled:pointer-events-none"
                    aria-label="Ver foto ampliada"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.url} alt="" className="h-full w-full object-cover" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <Input
                      value={product.name}
                      onChange={(e) => updateField(product.id, 'name', e.target.value)}
                      placeholder="Nome do produto"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Preço pago</span>
                    <Input
                      inputMode="decimal"
                      value={product.purchasePrice}
                      onChange={(e) => updateField(product.id, 'purchasePrice', e.target.value)}
                      placeholder="18,50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      Preço de venda
                    </span>
                    <Input
                      inputMode="decimal"
                      value={product.salePrice}
                      onChange={(e) => updateField(product.id, 'salePrice', e.target.value)}
                      placeholder="39,90"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Peso (kg)</span>
                    <Input
                      inputMode="decimal"
                      value={product.weight}
                      onChange={(e) => updateField(product.id, 'weight', e.target.value)}
                      placeholder="0,30"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Estoque</span>
                    <Input
                      inputMode="numeric"
                      value={product.stock}
                      onChange={(e) => updateField(product.id, 'stock', e.target.value)}
                      placeholder="10"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    loading={product.saving}
                    disabled={!product.name.trim()}
                    onClick={() => saveOne(product.id)}
                  >
                    {product.saving ? 'Salvando…' : 'Salvar'}
                  </Button>
                  <IconButton
                    tone="danger"
                    disabled={product.saving}
                    onClick={() => deleteOne(product.id)}
                    aria-label="Excluir"
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop/tablet: tabela */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/70 text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-3 pl-4 pr-3 font-semibold">Foto</th>
                    <th className="px-3 py-3 font-semibold">Nome do produto</th>
                    <th className="px-3 py-3 font-semibold">Preço pago</th>
                    <th className="px-3 py-3 font-semibold">Preço de venda</th>
                    <th className="px-3 py-3 font-semibold">Peso (kg)</th>
                    <th className="px-3 py-3 font-semibold">Estoque</th>
                    <th className="w-36 px-3 py-3 font-semibold">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="py-3 pl-4 pr-3">
                        <button
                          type="button"
                          onClick={() => product.url && setPreviewUrl(product.url)}
                          disabled={!product.url}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border/60 transition-transform duration-150 ease-out-soft hover:scale-105 active:scale-95 disabled:pointer-events-none"
                          aria-label="Ver foto ampliada"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={product.url} alt="" className="h-full w-full object-cover" />
                        </button>
                      </td>
                      <td className="min-w-48 px-3 py-3">
                        <Input
                          value={product.name}
                          onChange={(e) => updateField(product.id, 'name', e.target.value)}
                          placeholder="Ex: Carregador USB-C 20W"
                        />
                      </td>
                      <td className="min-w-32 px-3 py-3">
                        <Input
                          inputMode="decimal"
                          value={product.purchasePrice}
                          onChange={(e) => updateField(product.id, 'purchasePrice', e.target.value)}
                          placeholder="18,50"
                        />
                      </td>
                      <td className="min-w-32 px-3 py-3">
                        <Input
                          inputMode="decimal"
                          value={product.salePrice}
                          onChange={(e) => updateField(product.id, 'salePrice', e.target.value)}
                          placeholder="39,90"
                        />
                      </td>
                      <td className="min-w-28 px-3 py-3">
                        <Input
                          inputMode="decimal"
                          value={product.weight}
                          onChange={(e) => updateField(product.id, 'weight', e.target.value)}
                          placeholder="0,30"
                        />
                      </td>
                      <td className="min-w-24 px-3 py-3">
                        <Input
                          inputMode="numeric"
                          value={product.stock}
                          onChange={(e) => updateField(product.id, 'stock', e.target.value)}
                          placeholder="10"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            loading={product.saving}
                            disabled={!product.name.trim()}
                            onClick={() => saveOne(product.id)}
                          >
                            {product.saving ? '' : 'Salvar'}
                          </Button>
                          <IconButton
                            size="sm"
                            tone="danger"
                            disabled={product.saving}
                            onClick={() => deleteOne(product.id)}
                            aria-label="Excluir"
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {loaded && !pending.length && !previews.length && (
        <p className="mt-7 text-center text-sm text-muted">
          Nada aguardando no momento — envie fotos acima para começar um lote.
        </p>
      )}

      <AnimatePresence>
        {previewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setPreviewUrl(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[85vh] max-w-[min(90vw,32rem)] overflow-hidden rounded-3xl bg-surface shadow-lg"
            >
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors duration-150 hover:bg-black/70"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Foto do produto"
                className="max-h-[85vh] w-full object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
