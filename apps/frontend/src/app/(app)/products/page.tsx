'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Copy, Trash2, Pencil, Send, Download, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { DEMO_PRODUCTS } from '@/lib/demo-data';
import { Button, Card, Input, StatusPill } from '@/components/ui';
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
  demo?: boolean;
}

function demoResponse(search: string): ListResponse {
  const q = search.trim().toLowerCase();
  const items = (DEMO_PRODUCTS as ProductRow[]).filter(
    (p) =>
      !q ||
      p.vision?.name?.toLowerCase().includes(q) ||
      p.vision?.brand?.toLowerCase().includes(q) ||
      p.internalSku?.toLowerCase().includes(q),
  );
  return { items, total: items.length, page: 1, pages: 1, demo: true };
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page],
    queryFn: async () => {
      try {
        return await api.get<ListResponse>(
          `/products?search=${encodeURIComponent(search)}&page=${page}&limit=20`,
        );
      } catch {
        // Backend/MongoDB fora do ar → mostra o lote de demonstração (produtos reais do Brás)
        return demoResponse(search);
      }
    },
    refetchInterval: 8000,
  });

  async function duplicate(id: string) {
    await api.post(`/products/${id}/duplicate`);
    qc.invalidateQueries({ queryKey: ['products'] });
  }
  async function remove(id: string) {
    if (!confirm('Excluir este produto?')) return;
    await api.del(`/products/${id}`);
    qc.invalidateQueries({ queryKey: ['products'] });
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
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {data?.demo && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          Modo demonstração (offline) — exibindo os 11 produtos do lote Brás. Suba o backend +
          MongoDB para dados ao vivo.
        </div>
      )}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted">
            {selected.size > 0
              ? `${selected.size} selecionado(s)`
              : `${data?.total ?? 0} itens no catálogo`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {selected.size > 0 && (
            <>
              <Button variant="outline" size="sm" disabled={exporting} onClick={exportSelected}>
                <Download size={15} />
                {exporting ? 'Gerando...' : `Excel (${selected.size})`}
              </Button>
              <Button size="sm" disabled={publishing} onClick={publishSelected}>
                <Send size={15} />
                {publishing ? 'Publicando...' : `Publicar (${selected.size})`}
              </Button>
            </>
          )}
          <Link href="/lote" className="shrink-0">
            <Button size="sm" variant="outline">
              <Plus size={15} />
              Novo produto
            </Button>
          </Link>
          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
        </div>
      </header>

      {/* Mobile: lista em cards — uma tabela de 9 colunas não cabe numa tela de celular */}
      <div className="space-y-2 md:hidden">
        {isLoading && <p className="p-6 text-center text-sm text-muted">Carregando…</p>}
        {data?.items.map((p) => (
          <Card key={p._id} className="p-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1.5 shrink-0"
                checked={selected.has(p._id)}
                onChange={() => toggleSelected(p._id)}
                aria-label={`Selecionar ${p.vision?.name ?? p.internalSku}`}
              />
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
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
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted">
                    Compra <b className="text-fg">{formatBRL(p.pricing?.purchasePrice)}</b>
                  </span>
                  <span className="text-muted">
                    Venda <b className="text-fg">{formatBRL(p.pricing?.suggestedPrice)}</b>
                  </span>
                  <span className="text-success">{formatPercent(p.pricing?.marginPercent)}</span>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Link
                    href={`/products/${p._id}`}
                    className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Pencil size={15} />
                  </Link>
                  <button
                    onClick={() => duplicate(p._id)}
                    className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={() => remove(p._id)}
                    className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {data && data.items.length === 0 && !isLoading && (
          <p className="p-8 text-center text-sm text-muted">
            Nenhum produto. Comece pelo <b>Envio em Lote</b>.
          </p>
        )}
      </div>

      {/* Desktop/tablet: tabela completa */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={Boolean(data?.items.length) && selected.size === data?.items.length}
                    onChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="p-3 font-medium">Produto</th>
                <th className="p-3 font-medium">Categoria</th>
                <th className="p-3 font-medium">Compra</th>
                <th className="p-3 font-medium">Venda</th>
                <th className="p-3 font-medium">Margem</th>
                <th className="p-3 font-medium">IA</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted">
                    Carregando…
                  </td>
                </tr>
              )}
              {data?.items.map((p) => (
                <tr key={p._id} className="border-b border-border/60 hover:bg-surface-2">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p._id)}
                      onChange={() => toggleSelected(p._id)}
                      aria-label={`Selecionar ${p.vision?.name ?? p.internalSku}`}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
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
                  <td className="p-3 text-muted">{p.vision?.category ?? '—'}</td>
                  <td className="p-3 tabular-nums">{formatBRL(p.pricing?.purchasePrice)}</td>
                  <td className="p-3 font-medium tabular-nums">
                    {formatBRL(p.pricing?.suggestedPrice)}
                  </td>
                  <td className="p-3 tabular-nums text-success">
                    {formatPercent(p.pricing?.marginPercent)}
                  </td>
                  <td className="p-3 tabular-nums">
                    {p.aiConfidence ? `${Math.round(p.aiConfidence * 100)}%` : '—'}
                  </td>
                  <td className="p-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/products/${p._id}`}
                        className="rounded-lg p-2 text-muted hover:bg-surface hover:text-fg"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        onClick={() => duplicate(p._id)}
                        className="rounded-lg p-2 text-muted hover:bg-surface hover:text-fg"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        onClick={() => remove(p._id)}
                        className="rounded-lg p-2 text-muted hover:bg-surface hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted">
                    Nenhum produto. Comece pelo <b>Envio em Lote</b>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-muted">
            {page} / {data.pages}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
