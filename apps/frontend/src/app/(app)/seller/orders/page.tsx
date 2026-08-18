'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, CreditCard, PackageCheck, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBRL } from '@/lib/utils';
import { Card, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface SupplierOrderItem {
  supplierProductId?: string;
  supplierSku?: string;
  quantity?: number;
  costPrice?: number;
  name?: string;
  title?: string;
}

interface SellerOrder {
  id: string;
  supplierOrderId: string;
  externalOrderId: string;
  marketplace?: {
    name: string;
    status: string;
    exceptionReason?: string;
  } | null;
  supplier: {
    id: string;
    name: string;
    email?: string;
    logoUrl?: string;
  };
  items: SupplierOrderItem[];
  itemCount: number;
  totals: {
    saleAmount: number;
    supplierAmount: number;
    platformFee: number;
    sellerChargeAmount: number;
  };
  preparationStatus: string;
  shippingStatus: string;
  supplierPaymentStatus: string;
  supplierPaid: boolean;
  financialEntryId?: string;
  paidAt?: string | null;
  createdAt?: string;
}

interface SupplierGroup {
  supplier: SellerOrder['supplier'];
  orders: SellerOrder[];
  totals: {
    orders: number;
    items: number;
    supplierAmount: number;
    paid: number;
    unpaid: number;
  };
}

interface OrdersResponse {
  date: string;
  items: SellerOrder[];
  supplierGroups: SupplierGroup[];
  totals: {
    orders: number;
    items: number;
    supplierAmount: number;
    paid: number;
    unpaid: number;
  };
}

export default function SellerOrdersPage() {
  const [date, setDate] = useState(() => localDateInput());
  const { data, isLoading } = useQuery({
    queryKey: ['seller-orders', date],
    queryFn: () => api.get<OrdersResponse>(`/dropshipping/seller/orders?date=${date}`),
    refetchInterval: 10000,
  });

  const totals = data?.totals ?? { orders: 0, items: 0, supplierAmount: 0, paid: 0, unpaid: 0 };
  const subtitle = useMemo(() => {
    const formatted = new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');
    return `Pedidos do dia ${formatted}, separados por fornecedor`;
  }, [date]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Pedidos" subtitle={subtitle}>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-muted">
          <CalendarDays size={16} />
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-7 border-0 bg-transparent p-0 focus:ring-0"
            aria-label="Data dos pedidos"
          />
        </div>
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={ClipboardList}
          label="Pedidos no dia"
          value={totals.orders}
          loading={isLoading}
        />
        <Metric
          icon={PackageCheck}
          label="Itens vendidos"
          value={totals.items}
          loading={isLoading}
        />
        <Metric
          icon={CreditCard}
          label="A pagar fornecedores"
          value={formatBRL(totals.supplierAmount)}
          loading={isLoading}
        />
        <Metric icon={CreditCard} label="Pagos" value={totals.paid} loading={isLoading} />
        <Metric icon={Truck} label="Não pagos" value={totals.unpaid} loading={isLoading} />
      </div>

      <div className="space-y-4">
        {isLoading &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-[1.25rem]" />
          ))}

        {!isLoading &&
          data?.supplierGroups.map((group) => (
            <section
              key={group.supplier.id}
              className="overflow-hidden rounded-[1.25rem] border border-border bg-surface"
            >
              <header className="flex flex-col gap-4 border-b border-border bg-surface-2/50 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
                    {group.supplier.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={group.supplier.logoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-primary">
                        {initials(group.supplier.name)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold">{group.supplier.name}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {group.totals.orders} pedidos · {group.totals.items} itens
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[480px]">
                  <Info label="Total fornecedor" value={formatBRL(group.totals.supplierAmount)} />
                  <Info label="Pago" value={String(group.totals.paid)} tone="success" />
                  <Info label="Não pago" value={String(group.totals.unpaid)} tone="warning" />
                </div>
              </header>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-faint">
                      <th className="px-4 py-3">Pedido</th>
                      <th className="px-3 py-3">Marketplace</th>
                      <th className="px-3 py-3">Itens</th>
                      <th className="px-3 py-3">Valor fornecedor</th>
                      <th className="px-3 py-3">Pagamento fornecedor</th>
                      <th className="px-3 py-3">Preparação</th>
                      <th className="px-4 py-3">Envio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.orders.map((order) => (
                      <tr key={order.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium">{order.externalOrderId}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleTimeString('pt-BR')
                              : '-'}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-muted">
                          {platformLabel(order.marketplace?.name)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <p className="nums font-medium">{order.itemCount}</p>
                            <p className="line-clamp-1 text-xs text-muted">
                              {itemsPreview(order.items)}
                            </p>
                          </div>
                        </td>
                        <td className="nums px-3 py-3">{formatBRL(order.totals.supplierAmount)}</td>
                        <td className="px-3 py-3">
                          <PaymentPill
                            paid={order.supplierPaid}
                            status={order.supplierPaymentStatus}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={order.preparationStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={order.shippingStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

        {!isLoading && !data?.supplierGroups.length && (
          <Card className="flex flex-col items-center gap-2 py-16 text-center text-muted">
            <ClipboardList size={28} />
            <p className="text-sm">Nenhum pedido encontrado nesse dia.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <Card className="min-h-28">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
        <Icon size={15} />
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-7 w-20" />
      ) : (
        <p className="nums mt-3 text-2xl font-semibold">{value}</p>
      )}
    </Card>
  );
}

function Info({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p
        className={
          tone === 'success'
            ? 'nums mt-1 font-semibold text-success'
            : tone === 'warning'
              ? 'nums mt-1 font-semibold text-warning'
              : 'nums mt-1 font-semibold'
        }
      >
        {value}
      </p>
    </div>
  );
}

function PaymentPill({ paid, status }: { paid: boolean; status: string }) {
  return (
    <span
      className={
        paid
          ? 'inline-flex rounded-full bg-success/14 px-2.5 py-1 text-xs font-semibold text-success'
          : 'inline-flex rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning'
      }
    >
      {paid ? 'Pago ao fornecedor' : paymentLabel(status)}
    </span>
  );
}

function localDateInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function platformLabel(value?: string) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (normalized === 'shopee') return 'Shopee';
  if (['mercadolivre', 'mercadolibre', 'meli', 'ml'].includes(normalized)) return 'Mercado Livre';
  if (normalized === 'tiktokshop') return 'TikTok Shop';
  return value || '-';
}

function paymentLabel(status: string) {
  if (status === 'awaiting_confirmation') return 'Aguardando confirmação';
  if (status === 'pending') return 'Não pago';
  if (status === 'dispute') return 'Em disputa';
  if (status === 'canceled') return 'Cancelado';
  if (status === 'refunded') return 'Estornado';
  return 'Não pago';
}

function itemsPreview(items: SupplierOrderItem[]) {
  if (!items.length) return '-';
  return items
    .slice(0, 2)
    .map((item) => item.name || item.title || item.supplierSku || 'Produto')
    .join(', ');
}
