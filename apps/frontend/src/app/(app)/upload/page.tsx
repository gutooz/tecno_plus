'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
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
  name: string;
  purchasePrice: string;
  salePrice: string;
}

export default function UploadPage() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [products, setProducts] = useState<UploadedProduct[]>([]);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const startRef = useRef<number>(0);
  const [eta, setEta] = useState('');

  const current = products[active];
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

  function updateCurrent(field: 'name' | 'purchasePrice' | 'salePrice', value: string) {
    setProducts((prev) =>
      prev.map((product, index) =>
        index === active ? { ...product, [field]: value, saved: false } : product,
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
      setActive(0);
    } finally {
      setUploading(false);
      setEta('');
    }
  }

  async function saveCurrent(goNext = false) {
    if (!current) return;
    setSaving(true);
    try {
      const purchasePrice = Number(current.purchasePrice.replace(',', '.'));
      const salePrice = Number(current.salePrice.replace(',', '.'));

      await api.put(`/products/${current.id}`, {
        'vision.name': current.name,
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
      await api.post(`/products/${current.id}/process`);

      setProducts((prev) =>
        prev.map((product, index) => (index === active ? { ...product, saved: true } : product)),
      );
      if (goNext && active < products.length - 1) setActive((value) => value + 1);
    } finally {
      setSaving(false);
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

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lote Shopee</h1>
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

      {current && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={active === 0}
                onClick={() => setActive((value) => value - 1)}
              >
                <ArrowLeft size={16} />
                Anterior
              </Button>
              <p className="text-sm text-muted">
                Foto {active + 1} de {products.length}
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={active >= products.length - 1}
                onClick={() => setActive((value) => value + 1)}
              >
                Proxima
                <ArrowRight size={16} />
              </Button>
            </div>
            <div className="grid place-items-center bg-surface-2 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt=""
                className="max-h-[68vh] w-full max-w-3xl rounded-lg object-contain"
              />
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="rounded-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Dados do produto</h2>
                  <p className="text-xs text-muted">{current.internalSku}</p>
                </div>
                {current.saved && <CheckCircle2 className="text-success" size={20} />}
              </div>

              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Nome do produto</span>
                  <Input
                    value={current.name}
                    onChange={(e) => updateCurrent('name', e.target.value)}
                    placeholder="Ex: Carregador USB-C 20W"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Preco pago</span>
                  <Input
                    inputMode="decimal"
                    value={current.purchasePrice}
                    onChange={(e) => updateCurrent('purchasePrice', e.target.value)}
                    placeholder="Ex: 18,50"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Preco de venda</span>
                  <Input
                    inputMode="decimal"
                    value={current.salePrice}
                    onChange={(e) => updateCurrent('salePrice', e.target.value)}
                    placeholder="Ex: 39,90"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-2">
                <Button disabled={saving || !current.name.trim()} onClick={() => saveCurrent(true)}>
                  <Save size={16} />
                  {saving ? 'Salvando...' : 'Salvar e proxima'}
                </Button>
                <Button
                  variant="outline"
                  disabled={saving || !current.name.trim()}
                  onClick={() => saveCurrent(false)}
                >
                  Salvar
                </Button>
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
          </aside>
        </div>
      )}
    </div>
  );
}
