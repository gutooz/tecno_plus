'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ImagePlus,
  Search,
  Copy,
  Eye,
  Layers,
  Package,
  Trash2,
  Pencil,
  Send,
  Download,
  Plus,
  PackageOpen,
  Scale,
  ShoppingBag,
  Sparkles,
  UploadCloud,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Checkbox, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn, formatBRL, formatDate, formatPercent, productThumbnail } from '@/lib/utils';

interface ProductRow {
  _id: string;
  internalSku: string;
  status: string;
  aiConfidence: number;
  vision: { name?: string; brand?: string; category?: string; quantity?: number };
  content?: { category?: string };
  pricing?: { purchasePrice?: number; suggestedPrice?: number; marginPercent?: number };
  images?: { thumbnail?: string; original?: string; hd?: string; square?: string; webp?: string };
  publishedChannels?: string[];
  externalIds?: Record<string, string>;
  createdAt?: string;
}

interface ManualCreatedProduct {
  _id: string;
  internalSku: string;
}

interface ManualVariationDraft {
  option1: string;
  option2: string;
  sku: string;
  price: string;
  stock: string;
}

interface ListResponse {
  items: ProductRow[];
  total: number;
  page: number;
  pages: number;
}

interface ProductsDashboard {
  products: {
    processed: number;
    published: number;
    waiting: number;
    reviewing: number;
    error: number;
  };
}

type StatusCardKey = keyof ProductsDashboard['products'];

const STATUS_CARDS: {
  key: StatusCardKey;
  status: string;
  label: string;
  icon: LucideIcon;
  tint: string;
  iconColor: string;
}[] = [
  {
    key: 'processed',
    status: 'all',
    label: 'Processados',
    icon: Package,
    tint: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    key: 'published',
    status: 'published',
    label: 'Publicados',
    icon: CheckCircle2,
    tint: 'bg-success/12',
    iconColor: 'text-success',
  },
  {
    key: 'waiting',
    status: 'waiting',
    label: 'Aguardando',
    icon: Clock,
    tint: 'bg-warning/14',
    iconColor: 'text-warning',
  },
  {
    key: 'reviewing',
    status: 'needs_review',
    label: 'Revisando',
    icon: Eye,
    tint: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    key: 'error',
    status: 'error',
    label: 'Com erro',
    icon: AlertTriangle,
    tint: 'bg-danger/12',
    iconColor: 'text-danger',
  },
];

const STATUS_FILTERS: Record<string, { label: string; description: string }> = {
  all: {
    label: 'Processados',
    description: 'Inclui enviados, processamento, revisão, prontos, publicados e erros.',
  },
  waiting: {
    label: 'Aguardando',
    description: 'Produtos enviados ou ainda em processamento pela IA.',
  },
  uploaded: {
    label: 'Enviados',
    description: 'Fotos recebidas que ainda aguardam processamento.',
  },
  processing: {
    label: 'Processando',
    description: 'Produtos com alguma etapa da IA em andamento.',
  },
  needs_review: {
    label: 'Revisando',
    description: 'Produtos que precisam de conferência antes de publicar.',
  },
  ready: {
    label: 'Prontos',
    description: 'Produtos enriquecidos e prontos para publicação.',
  },
  published: {
    label: 'Publicados',
    description: 'Produtos já publicados em algum canal.',
  },
  error: {
    label: 'Com erro',
    description: 'Produtos que falharam em alguma etapa do processamento.',
  },
  draft: {
    label: 'Rascunhos',
    description: 'Produtos duplicados ou salvos como rascunho.',
  },
};

/**
 * A categoria "boa" (curada pelo agente de conteúdo) vive em `content.category`;
 * `vision.category` é só o palpite bruto da IA de visão, nem sempre presente.
 * Sem esse fallback a lista mostra "—" mesmo em produtos que já têm categoria.
 */
function categoryOf(p: ProductRow): string | undefined {
  return p.content?.category || p.vision?.category;
}

function isWaitingProduct(p: ProductRow): boolean {
  return p.status === 'uploaded' || p.status === 'processing';
}

function productListTitle(p: ProductRow): string {
  return p.vision?.name || (isWaitingProduct(p) ? 'Aguardando IA' : p.internalSku);
}

function productListSubtitle(p: ProductRow): string {
  if (p.vision?.brand) return p.vision.brand;
  if (isWaitingProduct(p)) return `SKU ${p.internalSku}`;
  return '—';
}

function productListImage(p: ProductRow): string | undefined {
  return productThumbnail(p.images) ?? (isWaitingProduct(p) ? p.images?.original : undefined);
}

interface ShopeeExportReport {
  totalProducts: number;
  exportedProducts: number;
  exportedRows: number;
  rejected: number;
  errors: number;
  warnings: number;
}

interface PublishBatchResponse {
  total: number;
  published: number;
  skippedExisting?: number;
  failed?: number;
  results?: PublishBatchResult[];
}

interface PublishBatchResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

interface ShopeePublishNotice {
  total: number;
  published: number;
  skippedExisting: number;
  failed: number;
  errors: FailureGroup[];
  fallbackError?: string;
}

interface FailureGroup {
  message: string;
  count: number;
}

/** O backend escapa acentos p/ caber no header HTTP (ver `encodeReportHeader`
 * no backend) — o JSON em si continua válido, só precisa do parse normal. */
function parseShopeeExportReport(headers: Headers): ShopeeExportReport | null {
  const raw = headers.get('X-Shopee-Export-Report');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShopeeExportReport;
  } catch {
    return null;
  }
}

function downloadFilename(headers: Headers, fallback: string): string {
  const disposition = headers.get('Content-Disposition');
  const match =
    disposition?.match(/filename\*=UTF-8''([^;]+)/i) ?? disposition?.match(/filename="?([^"]+)"?/i);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function productsPath({
  search,
  status,
  page,
}: {
  search: string;
  status: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('limit', '20');
  return `/products?${params.toString()}`;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';
  const activeFilter = statusFilter ? STATUS_FILTERS[statusFilter] : null;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [estimatingWeight, setEstimatingWeight] = useState(false);
  const [shopeeNotice, setShopeeNotice] = useState<ShopeePublishNotice | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (!shopeeNotice) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShopeeNotice(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shopeeNotice]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, statusFilter, page],
    queryFn: () => api.get<ListResponse>(productsPath({ search, status: statusFilter, page })),
    refetchInterval: 8000,
  });

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['products-dashboard-summary'],
    queryFn: () => api.get<ProductsDashboard>('/dashboard'),
    refetchInterval: 8000,
  });

  async function duplicate(id: string) {
    try {
      await api.post(`/products/${id}/duplicate`);
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (e) {
      alert(`Não foi possível duplicar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function remove(id: string) {
    if (!confirm('Excluir este produto?')) return;
    try {
      await api.del(`/products/${id}`);
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (e) {
      alert(`Não foi possível excluir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const ids = data?.items.map((p) => p._id) ?? [];
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }

  async function publishShopeeSelected() {
    if (!selected.size) return;
    setPublishing(true);
    try {
      const res = await api.post<PublishBatchResponse>('/products/publish-batch', {
        ids: [...selected],
        channel: 'shopee',
      });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['products'] });
      setShopeeNotice(toShopeePublishNotice(res));
    } catch (e) {
      setShopeeNotice({
        total: selected.size,
        published: 0,
        skippedExisting: 0,
        failed: selected.size,
        errors: [],
        fallbackError: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPublishing(false);
    }
  }

  async function exportSelected() {
    if (!selected.size) return;
    setExporting(true);
    try {
      const ids = [...selected].join(',');
      let { blob, headers } = await api.download(
        `/products/export/shopee?ids=${encodeURIComponent(ids)}`,
      );
      const report = parseShopeeExportReport(headers);

      // Produto sem peso/preço/estoque/descrição é rejeitado e sai do arquivo
      // (a regra é nunca inventar dado) — sem isso o usuário só via um .xlsx
      // com zero linhas e nenhuma pista do motivo.
      if (report && report.exportedRows === 0) {
        const withReport = await api.download(
          `/products/export/shopee?ids=${encodeURIComponent(ids)}&report=1`,
        );
        blob = withReport.blob;
        headers = withReport.headers;
        alert(
          `Nenhum produto foi exportado: ${report.rejected}/${report.totalProducts} rejeitado(s) ` +
            'por dado obrigatório ausente (peso, preço, estoque ou descrição). Baixando a versão ' +
            'de conferência (abas "Validação" e "Rejeitados") para ver o motivo de cada um.',
        );
      } else if (report && report.rejected > 0) {
        alert(
          `${report.exportedProducts}/${report.totalProducts} produto(s) exportado(s) — ` +
            `${report.rejected} ficaram de fora por dado obrigatório ausente.`,
        );
      }

      saveBlob(
        blob,
        downloadFilename(headers, `produtos-${new Date().toISOString().slice(0, 10)}.xlsx`),
      );
    } catch (e) {
      alert(`Não foi possível gerar o Excel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function regenerateImagesSelected() {
    if (!selected.size) return;
    if (
      !confirm(
        `Vai gerar novas fotos (com cena de uso) e parar de usar a foto original pra ${selected.size} produto(s). Continuar?`,
      )
    )
      return;
    setRegenerating(true);
    try {
      const res = await api.post<{ queued: number }>('/products/regenerate-images-batch', {
        ids: [...selected],
      });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['products'] });
      alert(`${res.queued} produto(s) na fila — as novas fotos aparecem em alguns minutos.`);
    } catch (e) {
      alert(`Não foi possível regenerar as imagens: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRegenerating(false);
    }
  }

  async function estimateWeightSelected() {
    if (!selected.size) return;
    if (
      !confirm(
        `A IA vai ESTIMAR o peso de envio de ${selected.size} produto(s) que estão sem peso — ` +
          `estimativa, não medição, e é ela que define o frete na Shopee. ` +
          `Quem já tem peso não é tocado. Continuar?`,
      )
    )
      return;
    setEstimatingWeight(true);
    try {
      const res = await api.post<{
        total: number;
        filled: number;
        failed: number;
        skipped: number;
      }>('/products/estimate-weight-batch', { ids: [...selected] });
      qc.invalidateQueries({ queryKey: ['products'] });
      alert(
        `${res.filled} peso(s) estimado(s).\n` +
          `${res.skipped} já tinha(m) peso (preservado).\n` +
          `${res.failed} sem estimativa — preencha na mão antes de exportar.`,
      );
    } catch (e) {
      alert(`Não foi possível estimar o peso: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEstimatingWeight(false);
    }
  }

  const allChecked = Boolean(data?.items.length) && selected.size === data?.items.length;
  const isEmpty = data && data.items.length === 0 && !isLoading;
  const selectedRows = data?.items.filter((p) => selected.has(p._id)) ?? [];
  const selectedAlreadyOnShopee = selectedRows.filter(hasShopeeListing).length;
  const selectedPendingShopee = Math.max(0, selected.size - selectedAlreadyOnShopee);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Produtos"
        subtitle={
          selected.size > 0
            ? `${selected.size} selecionado(s)`
            : activeFilter
              ? `${data?.total ?? 0} item(ns) em ${activeFilter.label.toLowerCase()}`
              : `${data?.total ?? 0} itens no catálogo`
        }
      >
        <div className="relative w-full max-w-xs sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Pesquisa instantânea…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => setManualOpen(true)}
        >
          <Plus size={15} />
          Novo produto
        </Button>
      </PageHeader>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_CARDS.map(({ key, status, label, icon: Icon, tint, iconColor }) => {
          const active = statusFilter === status;
          return (
            <Link
              key={key}
              href={`/products?status=${status}`}
              aria-current={active ? 'page' : undefined}
              aria-label={`Ver produtos ${label.toLowerCase()}`}
              className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              <Card
                interactive
                className={cn(
                  'flex min-h-28 flex-col justify-between gap-3 p-4',
                  active && 'border-primary/55 bg-primary/[0.06] ring-1 ring-primary/25',
                )}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${tint}`}>
                  <Icon size={18} className={iconColor} />
                </span>
                <div>
                  {isDashboardLoading ? (
                    <Skeleton className="h-7 w-12 rounded-lg" />
                  ) : (
                    <p className="nums text-2xl font-semibold leading-none">
                      {dashboard?.products[key] ?? 0}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs font-medium text-muted">{label}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {activeFilter && (
        <Card className="mb-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{activeFilter.label}</p>
            <p className="mt-0.5 text-sm text-muted">{activeFilter.description}</p>
          </div>
          <Link href="/products" className="shrink-0">
            <Button variant="outline" size="sm">
              <X size={15} />
              Limpar filtro
            </Button>
          </Link>
        </Card>
      )}

      <Card className="mb-3 flex flex-wrap items-center gap-3 p-4">
        <Checkbox checked={allChecked} onChange={toggleSelectAll} aria-label="Selecionar todos" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Envio para Shopee</p>
          <p className="text-sm text-muted">
            Selecione todos os produtos da página e suba apenas os que ainda não existem na sua
            Shopee.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
              {selectedPendingShopee} para subir · {selectedAlreadyOnShopee} já na Shopee
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.items.length}
            onClick={toggleSelectAll}
          >
            {allChecked ? 'Limpar seleção' : 'Selecionar todos'}
          </Button>
          <Button
            size="sm"
            loading={publishing}
            disabled={!selected.size || selectedPendingShopee === 0}
            onClick={publishShopeeSelected}
          >
            {!publishing && <ShoppingBag size={15} />}
            {publishing ? 'Subindo…' : `Subir para Shopee (${selectedPendingShopee})`}
          </Button>
        </div>
      </Card>

      {/* Barra de ações contextual — aparece ao selecionar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-medium text-primary">{selected.size} selecionado(s)</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={regenerating}
              onClick={regenerateImagesSelected}
            >
              {!regenerating && <Sparkles size={15} />}
              {regenerating ? 'Enviando…' : `Regenerar imagens (${selected.size})`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={estimatingWeight}
              onClick={estimateWeightSelected}
            >
              {!estimatingWeight && <Scale size={15} />}
              {estimatingWeight ? 'Estimando…' : `Estimar peso (${selected.size})`}
            </Button>
            <Button variant="outline" size="sm" loading={exporting} onClick={exportSelected}>
              {!exporting && <Download size={15} />}
              {exporting ? 'Gerando…' : `Excel (${selected.size})`}
            </Button>
            <Button
              size="sm"
              loading={publishing}
              disabled={selectedPendingShopee === 0}
              onClick={publishShopeeSelected}
            >
              {!publishing && <Send size={15} />}
              {publishing ? 'Subindo…' : `Subir Shopee (${selectedPendingShopee})`}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile: lista em cards */}
      <div className="space-y-2.5 md:hidden">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        {data?.items.map((p) => (
          <Card key={p._id} className="p-3.5">
            <div className="flex items-start gap-3">
              <Checkbox
                className="mt-1"
                checked={selected.has(p._id)}
                onChange={() => toggleSelected(p._id)}
                aria-label={`Selecionar ${productListTitle(p)}`}
              />
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border/60">
                {productListImage(p) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={productListImage(p)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-faint">
                    <PackageOpen size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{productListTitle(p)}</p>
                    <p className="truncate text-xs text-muted">
                      {categoryOf(p) ?? productListSubtitle(p)}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </div>
                <div className="nums mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted">
                    Compra <b className="text-fg">{formatBRL(p.pricing?.purchasePrice)}</b>
                  </span>
                  <span className="text-muted">
                    Venda <b className="text-fg">{formatBRL(p.pricing?.suggestedPrice)}</b>
                  </span>
                  <span className="font-medium text-success">
                    {formatPercent(p.pricing?.marginPercent)}
                  </span>
                  <span className={p.vision?.quantity ? 'text-muted' : 'font-medium text-warning'}>
                    Estoque <b className="text-fg">{p.vision?.quantity ?? '—'}</b>
                  </span>
                  <span className="text-muted">
                    Cadastro <b className="text-fg">{formatDate(p.createdAt)}</b>
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-1">
                  <Link href={`/products/${p._id}`} aria-label="Editar">
                    <IconButton size="sm">
                      <Pencil size={15} />
                    </IconButton>
                  </Link>
                  <IconButton size="sm" onClick={() => duplicate(p._id)} aria-label="Duplicar">
                    <Copy size={15} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    tone="danger"
                    onClick={() => remove(p._id)}
                    aria-label="Excluir"
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {isEmpty && <EmptyState />}
      </div>

      {/* Desktop/tablet: tabela premium */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint backdrop-blur">
                <th className="w-10 py-3 pl-4 pr-2">
                  <Checkbox
                    checked={allChecked}
                    onChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="px-3 py-3 font-semibold">Produto</th>
                <th className="px-3 py-3 font-semibold">Categoria</th>
                <th className="px-3 py-3 font-semibold">Compra</th>
                <th className="px-3 py-3 font-semibold">Venda</th>
                <th className="px-3 py-3 font-semibold">Margem</th>
                <th className="px-3 py-3 font-semibold">Estoque</th>
                <th className="px-3 py-3 font-semibold">IA</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Cadastro</th>
                <th className="px-3 py-3 pr-4 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={11} className="px-4 py-3">
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </td>
                  </tr>
                ))}
              {data?.items.map((p) => {
                const checked = selected.has(p._id);
                return (
                  <tr key={p._id} className={rowClass(checked)}>
                    <td className="py-3 pl-4 pr-2">
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleSelected(p._id)}
                        aria-label={`Selecionar ${productListTitle(p)}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60">
                          {productListImage(p) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productListImage(p)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-faint">
                              <PackageOpen size={16} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{productListTitle(p)}</p>
                          <p className="truncate text-xs text-muted">{productListSubtitle(p)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">{categoryOf(p) ?? '—'}</td>
                    <td className="nums px-3 py-3">{formatBRL(p.pricing?.purchasePrice)}</td>
                    <td className="nums px-3 py-3 font-medium">
                      {formatBRL(p.pricing?.suggestedPrice)}
                    </td>
                    <td className="nums px-3 py-3 font-medium text-success">
                      {formatPercent(p.pricing?.marginPercent)}
                    </td>
                    <td
                      className={cn(
                        'nums px-3 py-3',
                        p.vision?.quantity ? 'text-muted' : 'font-medium text-warning',
                      )}
                    >
                      {p.vision?.quantity ?? '—'}
                    </td>
                    <td className="nums px-3 py-3 text-muted">
                      {p.aiConfidence ? `${Math.round(p.aiConfidence * 100)}%` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="nums px-3 py-3 text-muted">{formatDate(p.createdAt)}</td>
                    <td className="px-3 py-3 pr-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link href={`/products/${p._id}`} aria-label="Editar">
                          <IconButton size="sm">
                            <Pencil size={15} />
                          </IconButton>
                        </Link>
                        <IconButton
                          size="sm"
                          onClick={() => duplicate(p._id)}
                          aria-label="Duplicar"
                        >
                          <Copy size={15} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          tone="danger"
                          onClick={() => remove(p._id)}
                          aria-label="Excluir"
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {isEmpty && (
                <tr>
                  <td colSpan={11}>
                    <EmptyState />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data && data.pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-1.5 text-sm">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="nums px-3 text-muted">
            {page} <span className="text-faint">de</span> {data.pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      {shopeeNotice && (
        <ShopeePublishDialog notice={shopeeNotice} onClose={() => setShopeeNotice(null)} />
      )}

      {manualOpen && (
        <ManualShopeeProductDialog
          onClose={() => setManualOpen(false)}
          onCreated={() => {
            setManualOpen(false);
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['products-dashboard-summary'] });
          }}
        />
      )}
    </div>
  );
}

const EMPTY_MANUAL_FORM = {
  title: '',
  description: '',
  shopeeCategoryId: '',
  category: '',
  brand: 'NoBrand',
  sku: '',
  gtin: '',
  purchasePrice: '',
  salePrice: '',
  stock: '',
  weight: '',
  length: '',
  width: '',
  height: '',
  variationName1: 'Cor',
  variationName2: 'Tamanho',
};

const EMPTY_VARIATION: ManualVariationDraft = {
  option1: '',
  option2: '',
  sku: '',
  price: '',
  stock: '',
};

function ManualShopeeProductDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(EMPTY_MANUAL_FORM);
  const [variations, setVariations] = useState<ManualVariationDraft[]>([{ ...EMPTY_VARIATION }]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  function setField(field: keyof typeof EMPTY_MANUAL_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function pickImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).slice(0, 9);
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles(selected);
    setPreviews(selected.map((file) => URL.createObjectURL(file)));
  }

  function updateVariation(index: number, field: keyof ManualVariationDraft, value: string) {
    setVariations((current) =>
      current.map((variation, i) => (i === index ? { ...variation, [field]: value } : variation)),
    );
  }

  function addVariation() {
    setVariations((current) => [...current, { ...EMPTY_VARIATION }]);
  }

  function removeVariation(index: number) {
    setVariations((current) =>
      current.length === 1 ? [{ ...EMPTY_VARIATION }] : current.filter((_, i) => i !== index),
    );
  }

  function validateStep(nextStep: 1 | 2) {
    setError(null);
    if (nextStep === 2) {
      if (!files.length) return setError('Envie pelo menos uma imagem do produto.');
      if (form.title.trim().length < 2) return setError('Informe o título do anúncio.');
      if (form.description.trim().length < 10) return setError('Informe uma descrição maior.');
    }
    setStep(nextStep);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!files.length) return setError('Envie pelo menos uma imagem do produto.');
    if (!form.shopeeCategoryId.trim()) return setError('Informe o ID da categoria Shopee.');
    if (!form.salePrice.trim()) return setError('Informe o preço de venda.');
    if (!form.stock.trim()) return setError('Informe o estoque.');
    if (!form.weight.trim() || !form.length.trim() || !form.width.trim() || !form.height.trim()) {
      return setError('Preencha peso, comprimento, largura e altura da embalagem.');
    }

    const cleanVariations = variations
      .map((variation) => ({
        name1: form.variationName1,
        option1: variation.option1.trim(),
        name2: form.variationName2,
        option2: variation.option2.trim(),
        sku: variation.sku.trim(),
        price: variation.price.trim(),
        stock: variation.stock.trim(),
      }))
      .filter((variation) => variation.option1 || variation.option2);

    setSaving(true);
    setProgress(0);
    try {
      await api.uploadTo<ManualCreatedProduct>('/products/manual', files, setProgress, {
        ...form,
        variations: JSON.stringify(cleanVariations),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-border/70 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingBag size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Novo produto Shopee</p>
            <p className="mt-1 text-sm text-muted">
              Cadastre como no Seller Center: fotos, dados obrigatórios, pacote e variações.
            </p>
          </div>
          <IconButton type="button" aria-label="Fechar cadastro" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="border-b border-border/70 px-5 py-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={stepButtonClass(step === 1)}
            >
              <ImagePlus size={15} /> Produto
            </button>
            <button
              type="button"
              onClick={() => validateStep(2)}
              className={stepButtonClass(step === 2)}
            >
              <Layers size={15} /> Variações
            </button>
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <section>
                <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border-strong bg-surface-2/60 px-5 py-8 text-center transition hover:border-primary/60 hover:bg-primary/[0.04]">
                  <UploadCloud size={30} className="text-primary" />
                  <span className="mt-3 text-sm font-semibold">Subir imagens</span>
                  <span className="mt-1 text-xs text-muted">Capa + até 8 imagens adicionais</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={pickImages}
                  />
                </label>

                {previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {previews.map((src, index) => (
                      <div
                        key={src}
                        className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        {index === 0 && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
                            Capa
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid gap-3.5 sm:grid-cols-2">
                <ManualField label="Título do produto" className="sm:col-span-2">
                  <Input
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    maxLength={120}
                    placeholder="Nome do produto para a Shopee"
                  />
                </ManualField>
                <ManualField label="ID categoria Shopee">
                  <Input
                    inputMode="numeric"
                    value={form.shopeeCategoryId}
                    onChange={(e) => setField('shopeeCategoryId', e.target.value)}
                    placeholder="120039"
                  />
                </ManualField>
                <ManualField label="Categoria interna">
                  <Input
                    value={form.category}
                    onChange={(e) => setField('category', e.target.value)}
                    placeholder="Papelaria > Canetas"
                  />
                </ManualField>
                <ManualField label="Marca">
                  <Input value={form.brand} onChange={(e) => setField('brand', e.target.value)} />
                </ManualField>
                <ManualField label="SKU">
                  <Input
                    value={form.sku}
                    onChange={(e) => setField('sku', e.target.value)}
                    placeholder="Opcional"
                  />
                </ManualField>
                <ManualField label="Preço de compra">
                  <Input
                    inputMode="decimal"
                    value={form.purchasePrice}
                    onChange={(e) => setField('purchasePrice', e.target.value)}
                    placeholder="7,00"
                  />
                </ManualField>
                <ManualField label="Preço Shopee">
                  <Input
                    inputMode="decimal"
                    value={form.salePrice}
                    onChange={(e) => setField('salePrice', e.target.value)}
                    placeholder="19,99"
                  />
                </ManualField>
                <ManualField label="Estoque">
                  <Input
                    inputMode="numeric"
                    value={form.stock}
                    onChange={(e) => setField('stock', e.target.value)}
                    placeholder="100"
                  />
                </ManualField>
                <ManualField label="GTIN/EAN">
                  <Input
                    inputMode="numeric"
                    value={form.gtin}
                    onChange={(e) => setField('gtin', e.target.value)}
                    placeholder="Opcional"
                  />
                </ManualField>
                <ManualField label="Peso com embalagem (kg)">
                  <Input
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(e) => setField('weight', e.target.value)}
                    placeholder="0,30"
                  />
                </ManualField>
                <div className="grid grid-cols-3 gap-2">
                  <ManualField label="Comp.">
                    <Input
                      inputMode="decimal"
                      value={form.length}
                      onChange={(e) => setField('length', e.target.value)}
                      placeholder="20"
                    />
                  </ManualField>
                  <ManualField label="Larg.">
                    <Input
                      inputMode="decimal"
                      value={form.width}
                      onChange={(e) => setField('width', e.target.value)}
                      placeholder="15"
                    />
                  </ManualField>
                  <ManualField label="Alt.">
                    <Input
                      inputMode="decimal"
                      value={form.height}
                      onChange={(e) => setField('height', e.target.value)}
                      placeholder="10"
                    />
                  </ManualField>
                </div>
                <ManualField label="Descrição do produto" className="sm:col-span-2">
                  <textarea
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    rows={5}
                    maxLength={5000}
                    placeholder="Descrição comercial completa, materiais, medidas, uso e itens inclusos."
                    className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-all duration-200 ease-out-soft placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary/15"
                  />
                </ManualField>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ManualField label="Nome da variação 1">
                  <Input
                    value={form.variationName1}
                    onChange={(e) => setField('variationName1', e.target.value)}
                    placeholder="Cor"
                  />
                </ManualField>
                <ManualField label="Nome da variação 2">
                  <Input
                    value={form.variationName2}
                    onChange={(e) => setField('variationName2', e.target.value)}
                    placeholder="Tamanho"
                  />
                </ManualField>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="grid grid-cols-[1fr_1fr_1fr_7rem_6rem_2.5rem] gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11px] uppercase tracking-wider text-faint">
                  <span>{form.variationName1 || 'Cor'}</span>
                  <span>{form.variationName2 || 'Tamanho'}</span>
                  <span>SKU</span>
                  <span>Preço</span>
                  <span>Estoque</span>
                  <span />
                </div>
                <div className="divide-y divide-border/70">
                  {variations.map((variation, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_1fr_1fr_7rem_6rem_2.5rem] gap-2 px-3 py-2"
                    >
                      <Input
                        value={variation.option1}
                        onChange={(e) => updateVariation(index, 'option1', e.target.value)}
                        placeholder="Preto"
                      />
                      <Input
                        value={variation.option2}
                        onChange={(e) => updateVariation(index, 'option2', e.target.value)}
                        placeholder="M"
                      />
                      <Input
                        value={variation.sku}
                        onChange={(e) => updateVariation(index, 'sku', e.target.value)}
                        placeholder="SKU"
                      />
                      <Input
                        inputMode="decimal"
                        value={variation.price}
                        onChange={(e) => updateVariation(index, 'price', e.target.value)}
                        placeholder={form.salePrice || '19,99'}
                      />
                      <Input
                        inputMode="numeric"
                        value={variation.stock}
                        onChange={(e) => updateVariation(index, 'stock', e.target.value)}
                        placeholder={form.stock || '10'}
                      />
                      <IconButton
                        type="button"
                        tone="danger"
                        aria-label="Remover variação"
                        onClick={() => removeVariation(index)}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addVariation}>
                <Plus size={15} /> Adicionar variação
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted">
            {saving ? `Enviando imagens... ${progress}%` : 'Condição padrão: produto novo.'}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {step === 1 ? (
              <Button type="button" onClick={() => validateStep(2)}>
                Próximo
              </Button>
            ) : (
              <Button type="submit" loading={saving}>
                <CheckCircle2 size={15} /> Salvar produto
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function ManualField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function stepButtonClass(active: boolean) {
  return cn(
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition',
    active
      ? 'border-primary/55 bg-primary/10 text-primary'
      : 'border-border bg-surface-2 text-muted',
  );
}

function toShopeePublishNotice(res: PublishBatchResponse): ShopeePublishNotice {
  return {
    total: res.total,
    published: res.published,
    skippedExisting: res.skippedExisting ?? 0,
    failed: res.failed ?? 0,
    errors: groupPublishErrors(res.results),
  };
}

function groupPublishErrors(results?: PublishBatchResult[]): FailureGroup[] {
  const grouped = new Map<string, number>();
  for (const result of results ?? []) {
    if (result.ok || !result.error) continue;
    const current = grouped.get(result.error) ?? 0;
    grouped.set(result.error, current + 1);
  }
  return [...grouped.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count);
}

function ShopeePublishDialog({
  notice,
  onClose,
}: {
  notice: ShopeePublishNotice;
  onClose: () => void;
}) {
  const allFailed = notice.total > 0 && notice.failed === notice.total;
  const hasFailures = notice.failed > 0;
  const Icon = allFailed ? XCircle : hasFailures ? AlertTriangle : CheckCircle2;
  const tone = allFailed ? 'danger' : hasFailures ? 'warning' : 'success';
  const title = allFailed
    ? 'Nenhum produto subiu para a Shopee'
    : hasFailures
      ? 'Envio para Shopee concluído com pendências'
      : 'Produtos enviados para a Shopee';
  const lead = notice.fallbackError
    ? 'A Shopee não recebeu o lote porque a API respondeu com erro.'
    : allFailed
      ? 'Todos os produtos foram barrados antes de publicar. Corrija o motivo abaixo e tente de novo.'
      : hasFailures
        ? 'Uma parte do lote subiu, mas alguns produtos precisam de ajuste antes de tentar novamente.'
        : 'O lote terminou sem falhas.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="shopee-publish-dialog-title"
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-border/70 p-5">
          <div
            className={cn(
              'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              tone === 'danger' && 'bg-danger/12 text-danger',
              tone === 'warning' && 'bg-warning/15 text-warning',
              tone === 'success' && 'bg-success/14 text-success',
            )}
          >
            <Icon size={23} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <p id="shopee-publish-dialog-title" className="text-base font-semibold text-fg">
              {title}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">{lead}</p>
          </div>
          <IconButton aria-label="Fechar aviso" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-3 gap-2.5">
            <PublishMetric label="Subiram" value={notice.published} tone="success" />
            <PublishMetric label="Já existiam" value={notice.skippedExisting} tone="muted" />
            <PublishMetric label="Falharam" value={notice.failed} tone="danger" />
          </div>

          {(notice.fallbackError || notice.errors.length > 0) && (
            <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
              <p className="text-sm font-semibold text-fg">Motivo encontrado</p>
              {notice.fallbackError ? (
                <p className="mt-2 text-sm leading-6 text-muted">{notice.fallbackError}</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {notice.errors.slice(0, 4).map((error) => (
                    <div key={error.message} className="rounded-xl bg-surface px-3 py-2">
                      <p className="text-sm leading-5 text-fg">{error.message}</p>
                      <p className="mt-1 text-xs font-medium text-muted">
                        {error.count} produto(s) com esse problema
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            {hasFailures && !notice.fallbackError && (
              <Link href="/integrations">
                <Button className="w-full sm:w-auto">
                  <ShoppingBag size={15} />
                  Ver integração Shopee
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PublishMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'muted';
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 px-3 py-3">
      <p
        className={cn(
          'nums text-xl font-semibold',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          tone === 'muted' && 'text-muted',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
    </div>
  );
}

function hasShopeeListing(product: ProductRow): boolean {
  return Boolean(product.externalIds?.shopee || product.publishedChannels?.includes('shopee'));
}

function rowClass(checked: boolean): string {
  return [
    'border-b border-border/60 transition-colors duration-150',
    checked ? 'bg-primary/[0.05]' : 'hover:bg-surface-2/70',
  ].join(' ');
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-surface-2 text-faint">
        <PackageOpen size={26} />
      </div>
      <div>
        <p className="text-sm font-medium">Nenhum produto ainda</p>
        <p className="mt-1 text-sm text-muted">
          Comece pelo{' '}
          <Link href="/lote" className="font-medium text-primary hover:underline">
            Envio em Lote
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
