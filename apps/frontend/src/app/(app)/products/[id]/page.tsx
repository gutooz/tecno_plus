'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { DEMO_PRODUCTS } from '@/lib/demo-data';
import { Button, Card, Input, StatusPill } from '@/components/ui';
import { formatBRL, formatPercent } from '@/lib/utils';

interface ProductDetail {
  _id: string;
  internalSku: string;
  status: string;
  aiConfidence: number;
  multipleProductsDetected?: boolean;
  vision: Record<string, unknown> & { name?: string; brand?: string };
  market?: { averagePrice?: number; minPrice?: number; maxPrice?: number; competition?: string };
  content?: {
    title?: string;
    description?: string;
    longDescription?: string;
    seo?: { slug?: string; metaDescription?: string; keywords?: string[] };
    technicalSpecs?: Record<string, string>;
  };
  pricing?: {
    purchasePrice?: number;
    suggestedPrice?: number;
    marginPercent?: number;
    roi?: number;
  };
  images?: { original?: string; hd?: string; square?: string; webp?: string; thumbnail?: string };
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [title, setTitle] = useState<string | undefined>();

  const { data: p, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      try {
        return await api.get<ProductDetail>(`/products/${id}`);
      } catch {
        return (DEMO_PRODUCTS as ProductDetail[]).find((x) => x._id === id) ?? null;
      }
    },
    refetchInterval: (q) =>
      ['processing', 'uploaded'].includes(q.state.data?.status ?? '') ? 3000 : false,
  });

  async function save() {
    await api.put(`/products/${id}`, {
      content: { ...p?.content, title: title ?? p?.content?.title },
    });
    qc.invalidateQueries({ queryKey: ['product', id] });
  }
  async function publish() {
    await api.post(`/products/${id}/publish`);
    qc.invalidateQueries({ queryKey: ['product', id] });
  }

  if (isLoading || !p) return <p className="text-muted">Carregando…</p>;

  const gallery = [p.images?.hd, p.images?.square, p.images?.webp, p.images?.original].filter(
    Boolean,
  ) as string[];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/products" className="flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} /> Produtos
        </Link>
        <div className="flex items-center gap-3">
          <StatusPill status={p.status} />
          <Button size="sm" onClick={publish}>
            <Send size={15} /> Publicar
          </Button>
        </div>
      </div>

      {p.multipleProductsDetected && (
        <Card className="mb-4 border-warning/40 text-sm">
          A IA detectou <b>múltiplos produtos</b> nesta foto. Considere separar a imagem ou criar
          registros adicionais.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <p className="mb-3 text-sm font-medium">Imagens</p>
            <div className="grid grid-cols-3 gap-2">
              {gallery.length === 0 && <p className="text-sm text-muted">Processando imagens…</p>}
              {gallery.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Confiança da IA</p>
              <span className="text-sm font-semibold">
                {Math.round((p.aiConfidence ?? 0) * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.round((p.aiConfidence ?? 0) * 100)}%` }}
              />
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-medium">Pesquisa de mercado</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Mín." value={formatBRL(p.market?.minPrice)} />
              <Stat label="Médio" value={formatBRL(p.market?.averagePrice)} />
              <Stat label="Máx." value={formatBRL(p.market?.maxPrice)} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Concorrência: <b className="text-fg">{p.market?.competition ?? '—'}</b>
            </p>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-medium">Precificação</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Compra" value={formatBRL(p.pricing?.purchasePrice)} />
              <Stat label="Venda sugerida" value={formatBRL(p.pricing?.suggestedPrice)} big />
              <Stat label="Margem" value={formatPercent(p.pricing?.marginPercent)} />
              <Stat label="ROI" value={formatPercent(p.pricing?.roi)} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="mb-3 text-sm font-medium">Conteúdo (editável)</p>
            <label className="text-xs text-muted">Título</label>
            <Input
              defaultValue={p.content?.title}
              onChange={(e) => setTitle(e.target.value)}
              className="mb-3 mt-1"
            />
            <label className="text-xs text-muted">Descrição</label>
            <p className="mt-1 rounded-xl bg-surface-2 p-3 text-sm">
              {p.content?.longDescription ?? p.content?.description ?? '—'}
            </p>
            <Button size="sm" className="mt-3" onClick={save}>
              Salvar alterações
            </Button>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-medium">SEO</p>
            <p className="text-xs text-muted">Slug</p>
            <p className="mb-2 text-sm">{p.content?.seo?.slug ?? '—'}</p>
            <p className="text-xs text-muted">Meta description</p>
            <p className="mb-2 text-sm">{p.content?.seo?.metaDescription ?? '—'}</p>
            <div className="flex flex-wrap gap-1.5">
              {(p.content?.seo?.keywords ?? []).map((k) => (
                <span key={k} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {k}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-medium">Especificações</p>
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {Object.entries(p.content?.technicalSpecs ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-border/50 py-1">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
              {!p.content?.technicalSpecs && <p className="text-muted">—</p>}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={big ? 'text-lg font-semibold' : 'text-sm font-medium'}>{value}</p>
    </div>
  );
}
