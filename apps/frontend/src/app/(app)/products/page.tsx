'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  Copy,
  Trash2,
  Pencil,
  Send,
  Download,
  Plus,
  PackageOpen,
  Scale,
  ShoppingBag,
  Sparkles,
  X,
  XCircle,
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
  images?: { thumbnail?: string };
  publishedChannels?: string[];
  externalIds?: Record<string, string>;
  createdAt?: string;
}

interface ListResponse {
  items: ProductRow[];
  total: number;
  page: number;
  pages: number;
}

/**
 * A categoria "boa" (curada pelo agente de conteúdo) vive em `content.category`;
 * `vision.category` é só o palpite bruto da IA de visão, nem sempre presente.
 * Sem esse fallback a lista mostra "—" mesmo em produtos que já têm categoria.
 */
function categoryOf(p: ProductRow): string | undefined {
  return p.content?.category || p.vision?.category;
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

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [estimatingWeight, setEstimatingWeight] = useState(false);
  const [shopeeNotice, setShopeeNotice] = useState<ShopeePublishNotice | null>(null);

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

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page],
    queryFn: () =>
      api.get<ListResponse>(`/products?search=${encodeURIComponent(search)}&page=${page}&limit=20`),
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
        <Link href="/lote" className="shrink-0">
          <Button size="sm" variant="outline">
            <Plus size={15} />
            Novo produto
          </Button>
        </Link>
      </PageHeader>

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
                aria-label={`Selecionar ${p.vision?.name ?? p.internalSku}`}
              />
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border/60">
                {productThumbnail(p.images) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={productThumbnail(p.images)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.vision?.name ?? p.internalSku}</p>
                    <p className="truncate text-xs text-muted">
                      {categoryOf(p) ?? p.vision?.brand ?? '—'}
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
                        aria-label={`Selecionar ${p.vision?.name ?? p.internalSku}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60">
                          {productThumbnail(p.images) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productThumbnail(p.images)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.vision?.name ?? p.internalSku}</p>
                          <p className="truncate text-xs text-muted">{p.vision?.brand ?? '—'}</p>
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
                  <td colSpan={9}>
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
    </div>
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
