'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Save, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
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
}

interface PendingApiItem {
  _id: string;
  internalSku: string;
  vision?: { name?: string; labelPrice?: number };
  images?: { original?: string };
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

  // Carrega o que já estava pendente (enviado antes, ainda sem título/preço)
  // para o Envio em Lote sobreviver a um F5 ou a voltar depois.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ items: PendingApiItem[] }>(
          '/products?status=uploaded&limit=100',
        );
        if (cancelled) return;
        setPending(
          res.items.map((it) => ({
            id: it._id,
            url: it.images?.original ?? '',
            internalSku: it.internalSku,
            name: it.vision?.name ?? '',
            purchasePrice: it.vision?.labelPrice ? String(it.vision.labelPrice) : '',
            salePrice: '',
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

  function updateField(id: string, field: 'name' | 'purchasePrice' | 'salePrice', value: string) {
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

      await api.put(`/products/${id}`, {
        'vision.name': product.name,
        'vision.labelPrice': Number.isFinite(purchasePrice) ? purchasePrice : 0,
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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">
          {pending.length
            ? `${pending.length} produto(s) aguardando título e preço`
            : 'Envie as fotos dos produtos — depois preencha título e preço de cada um'}
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-surface',
        )}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UploadCloud size={22} />
        </div>
        <p className="text-sm font-medium">Arraste as fotos aqui ou</p>
        <label>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg">
            <ImagePlus size={15} />
            Selecionar fotos
          </span>
        </label>
      </div>

      {previews.length > 0 && (
        <section className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {previews.length} foto(s) selecionada(s){uploading && ` — ${progress}%`}
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
              <Button size="sm" disabled={uploading} onClick={startUpload}>
                <UploadCloud size={15} />
                {uploading ? 'Enviando...' : 'Enviar tudo'}
              </Button>
            </div>
          </div>

          {uploading && (
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full bg-primary"
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
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {!uploading && (
                    <button
                      onClick={() => setPreviews((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                      title="Remover"
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
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Preencha e salve — ao salvar, o produto vai para o catálogo.
            </p>
            <Button disabled={savingAll || !fillableCount} onClick={saveAll}>
              <Save size={16} />
              {savingAll ? 'Salvando...' : `Salvar todos (${fillableCount})`}
            </Button>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="p-3 font-medium">Foto</th>
                    <th className="p-3 font-medium">Nome do produto</th>
                    <th className="p-3 font-medium">Preço pago</th>
                    <th className="p-3 font-medium">Preço de venda</th>
                    <th className="w-24 p-3 font-medium">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((product) => (
                    <tr key={product.id} className="border-b border-border/60 last:border-0">
                      <td className="p-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={product.url} alt="" className="h-full w-full object-cover" />
                        </div>
                      </td>
                      <td className="min-w-48 p-3">
                        <Input
                          value={product.name}
                          onChange={(e) => updateField(product.id, 'name', e.target.value)}
                          placeholder="Ex: Carregador USB-C 20W"
                        />
                      </td>
                      <td className="min-w-32 p-3">
                        <Input
                          inputMode="decimal"
                          value={product.purchasePrice}
                          onChange={(e) => updateField(product.id, 'purchasePrice', e.target.value)}
                          placeholder="18,50"
                        />
                      </td>
                      <td className="min-w-32 p-3">
                        <Input
                          inputMode="decimal"
                          value={product.salePrice}
                          onChange={(e) => updateField(product.id, 'salePrice', e.target.value)}
                          placeholder="39,90"
                        />
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={product.saving || !product.name.trim()}
                          onClick={() => saveOne(product.id)}
                        >
                          {product.saving ? '...' : 'Salvar'}
                        </Button>
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
        <p className="mt-6 text-center text-sm text-muted">
          Nada aguardando no momento — envie fotos acima para começar um lote.
        </p>
      )}
    </div>
  );
}
