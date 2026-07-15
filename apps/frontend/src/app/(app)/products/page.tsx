'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Copy,
  Trash2,
  Pencil,
  Send,
  Download,
  Plus,
  PackageOpen,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Checkbox, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { formatBRL, formatPercent } from '@/lib/utils';

interface ProductRow {
  _id: string;
  internalSku: string;
  status: string;
  aiConfidence: number;
  vision: { name?: string; brand?: string; category?: string };
  pricing?: { purchasePrice?: number; suggestedPrice?: number; marginPercent?: number };
  images?: { thumbnail?: string; original?: string };
  publishedChannels?: string[];
}

interface ListResponse {
  items: ProductRow[];
  total: number;
  page: number;
  pages: number;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

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

  async function publishSelected() {
    if (!selected.size) return;
    setPublishing(true);
    try {
      const res = await api.post<{ total: number; published: number }>('/products/publish-batch', {
        ids: [...selected],
      });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['products'] });
      alert(`${res.published}/${res.total} produtos publicados.`);
    } catch (e) {
      alert(`Não foi possível publicar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(false);
    }
  }

  async function exportSelected() {
    if (!selected.size) return;
    setExporting(true);
    try {
      const ids = [...selected].join(',');
      const blob = await api.download(`/products/export/shopee?ids=${encodeURIComponent(ids)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produtos-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
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

  const allChecked = Boolean(data?.items.length) && selected.size === data?.items.length;
  const isEmpty = data && data.items.length === 0 && !isLoading;

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
            <Button variant="outline" size="sm" loading={exporting} onClick={exportSelected}>
              {!exporting && <Download size={15} />}
              {exporting ? 'Gerando…' : `Excel (${selected.size})`}
            </Button>
            <Button size="sm" loading={publishing} onClick={publishSelected}>
              {!publishing && <Send size={15} />}
              {publishing ? 'Publicando…' : `Publicar (${selected.size})`}
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
                {(p.images?.thumbnail || p.images?.original) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.images.thumbnail || p.images.original}
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
                      {p.vision?.category ?? p.vision?.brand ?? '—'}
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
                <th className="px-3 py-3 font-semibold">IA</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 pr-4 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={9} className="px-4 py-3">
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
                          {(p.images?.thumbnail || p.images?.original) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.images.thumbnail || p.images.original}
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
                    <td className="px-3 py-3 text-muted">{p.vision?.category ?? '—'}</td>
                    <td className="nums px-3 py-3">{formatBRL(p.pricing?.purchasePrice)}</td>
                    <td className="nums px-3 py-3 font-medium">
                      {formatBRL(p.pricing?.suggestedPrice)}
                    </td>
                    <td className="nums px-3 py-3 font-medium text-success">
                      {formatPercent(p.pricing?.marginPercent)}
                    </td>
                    <td className="nums px-3 py-3 text-muted">
                      {p.aiConfidence ? `${Math.round(p.aiConfidence * 100)}%` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={p.status} />
                    </td>
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
    </div>
  );
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
