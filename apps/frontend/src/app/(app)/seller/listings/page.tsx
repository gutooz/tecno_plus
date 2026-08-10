'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Send, ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface Listing {
  _id: string;
  marketplace: string;
  status: string;
  listingData: { title?: string; categoryId?: string; stockToPublish?: number; warning?: string };
  pricing: { costPrice?: number; finalPrice?: number; profit?: number; profitPercent?: number };
  lastError?: string;
}

export default function SellerListingsPage() {
  const qc = useQueryClient();
  const [publishedItemId, setPublishedItemId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['seller-listings'],
    queryFn: () => api.get<Listing[]>('/dropshipping/seller/listings'),
    refetchInterval: 10000,
  });

  const publish = useMutation({
    mutationFn: (id: string) =>
      api.post<{ externalItemId?: string }>(
        `/dropshipping/seller/listings/${id}/request-publication`,
      ),
    onSuccess: (res) => {
      setPublishedItemId(res.externalItemId ?? null);
      qc.invalidateQueries({ queryKey: ['seller-listings'] });
    },
    onError: (err) => alert(err instanceof Error ? err.message : String(err)),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Meus produtos"
        subtitle="Produtos importados e preparados para publicação"
      />
      {publishedItemId && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-success/10 px-3.5 py-2.5 text-sm text-success">
          <CheckCircle2 size={15} className="shrink-0" />
          Publicado na Shopee. Item ID {publishedItemId}.
        </div>
      )}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3">Anúncio</th>
                <th className="px-3 py-3">Marketplace</th>
                <th className="px-3 py-3">Custo</th>
                <th className="px-3 py-3">Preço final</th>
                <th className="px-3 py-3">Margem</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))}
              {data?.map((listing) => (
                <tr key={listing._id} className="border-b border-border/60">
                  <td className="px-4 py-3">
                    <p className="font-medium">{listing.listingData.title}</p>
                    <p className="text-xs text-muted">{listing.listingData.warning}</p>
                    {listing.lastError && (
                      <p className="mt-1 text-xs text-danger">{listing.lastError}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted">{listing.marketplace}</td>
                  <td className="nums px-3 py-3">{money(listing.pricing.costPrice ?? 0)}</td>
                  <td className="nums px-3 py-3">{money(listing.pricing.finalPrice ?? 0)}</td>
                  <td className="nums px-3 py-3">
                    {(listing.pricing.profitPercent ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={listing.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!['draft', 'sync_error', 'rejected'].includes(listing.status)}
                      loading={publish.isPending}
                      onClick={() => publish.mutate(listing._id)}
                    >
                      <Send size={14} />
                      Publicar
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
                      <ShoppingBag size={28} />
                      <p className="text-sm">
                        Importe produtos do catálogo para preparar os anúncios.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
