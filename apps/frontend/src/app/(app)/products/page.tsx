'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Copy, Trash2, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Input, StatusPill } from '@/components/ui';
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

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page],
    queryFn: () =>
      api.get<ListResponse>(`/products?search=${encodeURIComponent(search)}&page=${page}&limit=20`),
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

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted">{data?.total ?? 0} itens no catálogo</p>
        </div>
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
      </header>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
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
                  <td colSpan={8} className="p-8 text-center text-muted">
                    Carregando…
                  </td>
                </tr>
              )}
              {data?.items.map((p) => (
                <tr key={p._id} className="border-b border-border/60 hover:bg-surface-2">
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
                  <td colSpan={8} className="p-8 text-center text-muted">
                    Nenhum produto. Comece pelo <b>Upload</b>.
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
