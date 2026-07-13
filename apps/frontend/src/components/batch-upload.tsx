'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Save,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Preview {
  file: File;
  url: string;
}

interface UploadedProduct extends Preview {
  id: string;
  internalSku?: string;
  status?: string;
  saved?: boolean;
  saving?: boolean;
  name: string;
  purchasePrice: string;
  salePrice: string;
}

/**
 * Upload + preenchimento de produtos em lote: sobe N fotos de uma vez, edita
 * nome/preço de todas numa tabela e salva tudo com um clique. Usada tanto na
 * tela de Upload quanto na tela de Envio em Lote (mesma ferramenta, títulos
 * diferentes) — ver apps/frontend/src/app/(app)/upload e .../lote.
 */
export function BatchUpload({ title = 'Lote Shopee' }: { title?: string }) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [products, setProducts] = useState<UploadedProduct[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const startRef = useRef<number>(0);
  const [eta, setEta] = useState('');

  const completed = products.filter((p) => p.saved).length;
  const canExport = products.length > 0 && completed === products.length;

  const addFiles = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPreviews((prev) => [
      ...prev,
      ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }, []);

  const previewCount = useMemo(() => previews.length, [previews.length]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function updateProduct(
    index: number,
    field: 'name' | 'purchasePrice' | 'salePrice',
    value: string,
  ) {
    setProducts((prev) =>
      prev.map((product, i) =>
        i === index ? { ...product, [field]: value, saved: false } : product,
      ),
    );
  }

  async function startUpload() {
    if (!previews.length) return;
    setUploading(true);
    setProgress(0);
    startRef.current = Date.now();

    try {
      const selected = previews;
      const res = await api.upload(
        selected.map((p) => p.file),
        (pct) => {
          setProgress(pct);
          const elapsed = (Date.now() - startRef.current) / 1000;
          if (pct > 0) {
            const total = elapsed / (pct / 100);
            setEta(`${Math.max(0, Math.round(total - elapsed))}s restantes`);
          }
        },
        { deferPipeline: true },
      );

      const uploaded = res.products.map((product, index) => ({
        ...selected[index],
        id: product.id,
        internalSku: product.internalSku,
        status: product.status,
        name: '',
        purchasePrice: '',
        salePrice: '',
        saved: false,
      }));

      setProducts(uploaded);
      setPreviews([]);
    } finally {
      setUploading(false);
      setEta('');
    }
  }

  /** Salva nome/preço de UM produto e dispara o pipeline. Usada tanto pelo
   * botão por linha quanto pelo "Salvar todos" (lote). */
  async function saveProduct(index: number): Promise<boolean> {
    const product = products[index];
    if (!product || !product.name.trim()) return false;

    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, saving: true } : p)));
    try {
      const purchasePrice = Number(product.purchasePrice.replace(',', '.'));
      const salePrice = Number(product.salePrice.replace(',', '.'));

      await api.put(`/products/${product.id}`, {
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
      await api.post(`/products/${product.id}/process`);

      setProducts((prev) =>
        prev.map((p, i) => (i === index ? { ...p, saved: true, saving: false } : p)),
      );
      return true;
    } catch {
      setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, saving: false } : p)));
      return false;
    }
  }

  /** Salva todos os produtos preenchidos (e ainda não salvos) de uma vez — é o
   * ponto central do "envio em lote": preencher a tabela inteira e confirmar 1x. */
  async function saveAll() {
    const pending = products.map((p, i) => ({ p, i })).filter(({ p }) => !p.saved && p.name.trim());
    if (!pending.length) return;

    setSavingAll(true);
    try {
      await Promise.all(pending.map(({ i }) => saveProduct(i)));
    } finally {
      setSavingAll(false);
    }
  }

  async function exportShopee() {
    if (!products.length) return;
    setExporting(true);
    try {
      const ids = products.map((p) => p.id).join(',');
      const blob = await api.download(`/products/export/shopee?ids=${encodeURIComponent(ids)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopee-lote-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const fillableCount = products.filter((p) => p.name.trim() && !p.saved).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted">
            {products.length
              ? `${completed}/${products.length} produtos preenchidos`
              : `${previewCount} imagens selecionadas`}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!canExport || exporting}
          onClick={exportShopee}
          className="shrink-0"
        >
          <FileSpreadsheet size={16} />
          {exporting ? 'Gerando...' : 'Baixar Excel'}
        </Button>
      </header>

      {!products.length && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition',
              dragging ? 'border-primary bg-primary/5' : 'border-border bg-surface',
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud size={26} />
            </div>
            <p className="font-medium">Arraste as imagens aqui</p>
            <label>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg">
                <ImagePlus size={16} />
                Selecionar fotos
              </span>
            </label>
          </div>

          {previews.length > 0 && (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {previews.length} foto(s)
                  {uploading && ` - ${progress}% - ${eta}`}
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
        </>
      )}

      {products.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Preencha nome e preço de cada produto — depois salve tudo de uma vez.
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
                    <th className="w-24 p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
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
                          onChange={(e) => updateProduct(index, 'name', e.target.value)}
                          placeholder="Ex: Carregador USB-C 20W"
                        />
                      </td>
                      <td className="min-w-32 p-3">
                        <Input
                          inputMode="decimal"
                          value={product.purchasePrice}
                          onChange={(e) => updateProduct(index, 'purchasePrice', e.target.value)}
                          placeholder="18,50"
                        />
                      </td>
                      <td className="min-w-32 p-3">
                        <Input
                          inputMode="decimal"
                          value={product.salePrice}
                          onChange={(e) => updateProduct(index, 'salePrice', e.target.value)}
                          placeholder="39,90"
                        />
                      </td>
                      <td className="p-3">
                        {product.saved ? (
                          <span className="flex items-center gap-1.5 text-success">
                            <CheckCircle2 size={16} />
                            Salvo
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={product.saving || !product.name.trim()}
                            onClick={() => saveProduct(index)}
                          >
                            {product.saving ? '...' : 'Salvar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Progresso</p>
              <p className="text-sm text-muted">
                {completed}/{products.length}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-success transition-all"
                style={{ width: `${products.length ? (completed / products.length) * 100 : 0}%` }}
              />
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full"
              disabled={!canExport || exporting}
              onClick={exportShopee}
            >
              <Download size={16} />
              {exporting ? 'Gerando...' : 'Exportar lote Shopee'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
