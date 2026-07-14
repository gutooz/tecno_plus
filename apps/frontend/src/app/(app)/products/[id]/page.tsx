'use client';

import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Send, X, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input, Skeleton, StatusPill } from '@/components/ui';
import { formatBRL, formatPercent } from '@/lib/utils';

interface ProductDetail {
  _id: string;
  internalSku: string;
  status: string;
  aiConfidence: number;
  multipleProductsDetected?: boolean;
  vision: Record<string, unknown> & {
    name?: string;
    brand?: string;
    category?: string;
    weight?: number;
  };
  market?: { averagePrice?: number; minPrice?: number; maxPrice?: number; competition?: string };
  content?: {
    title?: string;
    description?: string;
    longDescription?: string;
    category?: string;
    seo?: { slug?: string; metaDescription?: string; keywords?: string[] };
    technicalSpecs?: Record<string, string>;
  };
  pricing?: {
    purchasePrice?: number;
    suggestedPrice?: number;
    marginPercent?: number;
    roi?: number;
  };
  images?: {
    original?: string;
    hd?: string;
    square?: string;
    webp?: string;
    thumbnail?: string;
    shopee?: string[];
  };
}

interface EditableFields {
  title: string;
  description: string;
  category: string;
  purchasePrice: string;
  salePrice: string;
  weight: string;
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [edit, setEdit] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Lightbox: fecha no Esc e trava o scroll do fundo enquanto aberto.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightbox]);

  const { data: p, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
    refetchInterval: (q) =>
      ['processing', 'uploaded'].includes(q.state.data?.status ?? '') ? 3000 : false,
  });

  const fields: EditableFields = edit ?? {
    title: p?.content?.title ?? p?.vision?.name ?? '',
    description: p?.content?.longDescription ?? p?.content?.description ?? '',
    category: p?.content?.category ?? p?.vision?.category ?? '',
    purchasePrice: p?.pricing?.purchasePrice != null ? String(p.pricing.purchasePrice) : '',
    salePrice: p?.pricing?.suggestedPrice != null ? String(p.pricing.suggestedPrice) : '',
    weight: p?.vision?.weight != null ? String(p.vision.weight) : '',
  };

  function updateField(field: keyof EditableFields, value: string) {
    setEdit({ ...fields, [field]: value });
  }

  async function save() {
    setSaving(true);
    try {
      const purchasePrice = Number(fields.purchasePrice.replace(',', '.'));
      const salePrice = Number(fields.salePrice.replace(',', '.'));
      const weight = Number(fields.weight.replace(',', '.'));
      await api.put(`/products/${id}`, {
        'content.title': fields.title,
        'content.description': fields.description,
        'content.longDescription': fields.description,
        'content.category': fields.category,
        // Peso é obrigatório pela Shopee (frete) — só grava se um número > 0 foi
        // digitado; nunca inventamos um valor (chave omitida = undefined no JSON).
        'vision.weight': Number.isFinite(weight) && weight > 0 ? weight : undefined,
        'pricing.purchasePrice': Number.isFinite(purchasePrice) ? purchasePrice : 0,
        'pricing.suggestedPrice': Number.isFinite(salePrice) ? salePrice : 0,
        'pricing.profit':
          Number.isFinite(purchasePrice) && Number.isFinite(salePrice)
            ? salePrice - purchasePrice
            : 0,
        // Margem e ROI em escala 0–100 (mesmo padrão do pipeline/computePrice),
        // pois o formatPercent exibe o valor direto, sem multiplicar por 100.
        'pricing.marginPercent':
          Number.isFinite(salePrice) && salePrice > 0 && Number.isFinite(purchasePrice)
            ? ((salePrice - purchasePrice) / salePrice) * 100
            : 0,
        'pricing.roi':
          Number.isFinite(purchasePrice) && purchasePrice > 0 && Number.isFinite(salePrice)
            ? ((salePrice - purchasePrice) / purchasePrice) * 100
            : 0,
      });
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['product', id] });
    } catch (e) {
      alert(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }
  async function publish() {
    setPublishing(true);
    try {
      await api.post(`/products/${id}/publish`);
      qc.invalidateQueries({ queryKey: ['product', id] });
    } catch (e) {
      alert(`Não foi possível publicar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(false);
    }
  }

  if (isLoading || !p) return <DetailSkeleton />;

  // Mostra as 3 imagens Shopee (produto recortado em fundo limpo) quando prontas;
  // senão, cai nas variantes antigas. A foto original entra ao fim como referência.
  const gallery = (
    p.images?.shopee?.length
      ? [...p.images.shopee, p.images?.original]
      : [p.images?.hd, p.images?.square, p.images?.webp, p.images?.original]
  ).filter(Boolean) as string[];

  const confidence = Math.round((p.aiConfidence ?? 0) * 100);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/products"
          className="group flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft
            size={16}
            className="transition-transform duration-200 ease-out-soft group-hover:-translate-x-0.5"
          />
          Produtos
        </Link>
        <div className="flex items-center gap-3">
          <StatusPill status={p.status} />
          <Button size="sm" loading={publishing} onClick={publish}>
            {!publishing && <Send size={15} />}
            {publishing ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
      </div>

      {p.multipleProductsDetected && (
        <div className="mb-4 flex items-start gap-3 rounded-3xl border border-warning/30 bg-warning/[0.08] p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <p>
            A IA detectou <b>múltiplos produtos</b> nesta foto. Considere separar a imagem ou criar
            registros adicionais.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <p className="mb-3.5 text-sm font-semibold">Imagens</p>
            <div className="grid grid-cols-3 gap-2.5">
              {gallery.length === 0 && (
                <p className="col-span-3 py-4 text-sm text-muted">Processando imagens…</p>
              )}
              {gallery.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(src)}
                  aria-label="Ampliar imagem"
                  className="group relative overflow-hidden rounded-2xl border border-border ring-primary/45 transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="aspect-square w-full cursor-zoom-in object-cover transition-transform duration-300 ease-out-soft group-hover:scale-[1.06]"
                  />
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Confiança da IA</p>
              <span className="nums text-sm font-semibold">{confidence}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${confidence}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </Card>

          <Card>
            <p className="mb-3.5 text-sm font-semibold">Pesquisa de mercado</p>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <Stat label="Mín." value={formatBRL(p.market?.minPrice)} />
              <Stat label="Médio" value={formatBRL(p.market?.averagePrice)} />
              <Stat label="Máx." value={formatBRL(p.market?.maxPrice)} />
            </div>
            <p className="mt-3.5 text-xs text-muted">
              Concorrência: <b className="text-fg">{p.market?.competition ?? '—'}</b>
            </p>
          </Card>

          <Card>
            <p className="mb-3.5 text-sm font-semibold">Margem calculada</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Margem" value={formatPercent(p.pricing?.marginPercent)} />
              <Stat label="ROI" value={formatPercent(p.pricing?.roi)} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Recalculada ao salvar, a partir dos preços ao lado.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="mb-3.5 text-sm font-semibold">Dados do produto (editável)</p>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Título" className="sm:col-span-2">
                <Input
                  value={fields.title}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </Field>
              <Field label="Categoria">
                <Input
                  value={fields.category}
                  onChange={(e) => updateField('category', e.target.value)}
                />
              </Field>
              <Field label="Peso (kg)">
                <Input
                  inputMode="decimal"
                  value={fields.weight}
                  onChange={(e) => updateField('weight', e.target.value)}
                  placeholder="0,30"
                />
              </Field>
              <Field label="Preço de compra">
                <Input
                  inputMode="decimal"
                  value={fields.purchasePrice}
                  onChange={(e) => updateField('purchasePrice', e.target.value)}
                  placeholder="18,50"
                />
              </Field>
              <Field label="Preço de venda">
                <Input
                  inputMode="decimal"
                  value={fields.salePrice}
                  onChange={(e) => updateField('salePrice', e.target.value)}
                  placeholder="39,90"
                />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <textarea
                  value={fields.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-all duration-200 ease-out-soft placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </Field>
            </div>
            <Button size="sm" className="mt-4" loading={saving} onClick={save}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </Card>

          <Card>
            <p className="mb-3.5 text-sm font-semibold">SEO</p>
            <p className="text-xs font-medium text-faint">Slug</p>
            <p className="mb-2.5 truncate text-sm">{p.content?.seo?.slug ?? '—'}</p>
            <p className="text-xs font-medium text-faint">Meta description</p>
            <p className="mb-3 text-sm text-muted">{p.content?.seo?.metaDescription ?? '—'}</p>
            <div className="flex flex-wrap gap-1.5">
              {(p.content?.seo?.keywords ?? []).map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
                >
                  {k}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <p className="mb-3.5 text-sm font-semibold">Especificações</p>
            <dl className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
              {Object.entries(p.content?.technicalSpecs ?? {}).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
                >
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
              {!p.content?.technicalSpecs && <p className="text-muted">—</p>}
            </dl>
          </Card>
        </div>
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={() => setLightbox(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Fechar"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            >
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
              src={lightbox}
              alt=""
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="nums mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-80 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
