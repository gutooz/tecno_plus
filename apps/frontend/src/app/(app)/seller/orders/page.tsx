'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface MarketplaceOrder {
  _id: string;
  marketplace: string;
  externalOrderId: string;
  status: string;
  exceptionReason?: string;
  items: Record<string, unknown>[];
  createdAt?: string;
}

export default function SellerOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['seller-orders'],
    queryFn: () => api.get<MarketplaceOrder[]>('/dropshipping/seller/orders'),
    refetchInterval: 10000,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Pedidos" subtitle="Pedidos recebidos dos marketplaces conectados" />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3">Pedido</th>
                <th className="px-3 py-3">Marketplace</th>
                <th className="px-3 py-3">Itens</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3">Observação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))}
              {data?.map((order) => (
                <tr key={order._id} className="border-b border-border/60">
                  <td className="px-4 py-3">
                    <p className="font-medium">{order.externalOrderId}</p>
                    <p className="text-xs text-muted">
                      {order.createdAt ? new Date(order.createdAt).toLocaleString('pt-BR') : '-'}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-muted">{order.marketplace}</td>
                  <td className="px-3 py-3">{order.items.length}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{order.exceptionReason || '-'}</td>
                </tr>
              ))}
              {!isLoading && !data?.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
                      <ClipboardList size={28} />
                      <p className="text-sm">Nenhum pedido sincronizado ainda.</p>
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
