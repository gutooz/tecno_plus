'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface SupplierOrder {
  _id: string;
  externalOrderId: string;
  preparationStatus: string;
  paymentStatus: string;
  shippingStatus: string;
  items: { supplierSku?: string; quantity?: number; costPrice?: number }[];
  totals?: { supplierAmount?: number; saleAmount?: number };
  createdAt?: string;
}

export default function SupplierOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-orders'],
    queryFn: () => api.get<SupplierOrder[]>('/dropshipping/supplier/orders'),
    refetchInterval: 10000,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Pedidos"
        subtitle="Pedidos de fornecimento criados a partir das vendas dos vendedores"
      />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3">Pedido</th>
                <th className="px-3 py-3">Itens</th>
                <th className="px-3 py-3">Pagamento</th>
                <th className="px-3 py-3">Preparação</th>
                <th className="px-3 py-3">Envio</th>
                <th className="px-4 py-3">Valor previsto</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
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
                  <td className="px-3 py-3 text-muted">{order.items.length} item(ns)</td>
                  <td className="px-3 py-3">
                    <StatusPill status={order.paymentStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={order.preparationStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={order.shippingStatus} />
                  </td>
                  <td className="nums px-4 py-3">{money(order.totals?.supplierAmount ?? 0)}</td>
                </tr>
              ))}
              {!isLoading && !data?.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
                      <ClipboardList size={28} />
                      <p className="text-sm">Nenhum pedido de fornecimento entrou ainda.</p>
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
