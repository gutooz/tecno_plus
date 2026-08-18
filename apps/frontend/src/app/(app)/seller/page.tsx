'use client';

import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Download,
  DollarSign,
  Package,
  ShoppingBag,
  Store,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn, formatBRL } from '@/lib/utils';

interface SalesMetric {
  orders: number;
  amount: number;
}

interface TimePoint extends SalesMetric {
  date: string;
  label: string;
}

interface TopProduct {
  name: string;
  units: number;
  amount: number;
  imageUrl?: string;
}

interface RecentOrder {
  id: string;
  externalOrderId: string;
  customer: string;
  marketplace: string;
  status: string;
  amount: number;
  createdAt?: string;
}

interface FinanceSummary {
  gross: number;
  costs: number;
  net: number;
  margin: number;
  pending: number;
  paid: number;
}

interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  tone: string;
  read: boolean;
  createdAt?: string;
}

interface SellerDashboard {
  catalogAvailable: number;
  listings: number;
  orders: number;
  unread: number;
  productsSold: number;
  ticketAverage: number;
  sales: {
    total: SalesMetric;
    shopee: SalesMetric;
    mercadoLivre: SalesMetric;
    other?: SalesMetric;
  };
  timeSeries: TimePoint[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
  finance: FinanceSummary;
  notifications: DashboardNotification[];
}

const EMPTY_METRIC: SalesMetric = { orders: 0, amount: 0 };
const EMPTY_FINANCE: FinanceSummary = {
  gross: 0,
  costs: 0,
  net: 0,
  margin: 0,
  pending: 0,
  paid: 0,
};

const CHANNEL_COLORS = {
  shopee: '#2f8cff',
  mercadoLivre: '#ffd21f',
  other: '#8b5cf6',
};

export default function SellerDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['seller-dashboard'],
    queryFn: () => api.get<SellerDashboard>('/dropshipping/seller/dashboard'),
    refetchInterval: 10000,
  });

  const sales = data?.sales ?? {
    total: EMPTY_METRIC,
    shopee: EMPTY_METRIC,
    mercadoLivre: EMPTY_METRIC,
    other: EMPTY_METRIC,
  };
  const finance = data?.finance ?? EMPTY_FINANCE;
  const channels = [
    { key: 'shopee', label: 'Shopee', metric: sales.shopee, color: CHANNEL_COLORS.shopee },
    {
      key: 'mercadoLivre',
      label: 'Mercado Livre',
      metric: sales.mercadoLivre,
      color: CHANNEL_COLORS.mercadoLivre,
    },
    {
      key: 'other',
      label: 'Outros',
      metric: sales.other ?? EMPTY_METRIC,
      color: CHANNEL_COLORS.other,
    },
  ];

  return (
    <div className="mx-auto max-w-[1360px]">
      <PageHeader title="Dashboard" subtitle="Visão geral do seu negócio">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" type="button">
            <CalendarDays size={15} />
            Últimos 7 dias
            <ChevronDown size={14} />
          </Button>
          <Button variant="outline" size="sm" type="button">
            <Download size={15} />
            Exportar relatório
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={DollarSign}
          label="Vendas totais"
          value={formatBRL(sales.total.amount)}
          detail={`${sales.total.orders} pedido(s) nos últimos 7 dias`}
          loading={isLoading}
          series={data?.timeSeries.map((point) => point.amount) ?? []}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Pedidos totais"
          value={sales.total.orders}
          detail="Todos os canais conectados"
          loading={isLoading}
          series={data?.timeSeries.map((point) => point.orders) ?? []}
        />
        <KpiCard
          icon={Package}
          label="Produtos vendidos"
          value={data?.productsSold ?? 0}
          detail={`${data?.listings ?? 0} produto(s) anunciado(s)`}
          loading={isLoading}
          series={(data?.topProducts ?? []).map((product) => product.units)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket médio"
          value={formatBRL(data?.ticketAverage ?? 0)}
          detail="Média por pedido"
          loading={isLoading}
          series={data?.timeSeries.map((point) => point.amount / Math.max(point.orders, 1)) ?? []}
        />
        <KpiCard
          icon={BarChart3}
          label="Lucro líquido"
          value={formatBRL(finance.net)}
          detail={`${finance.margin.toFixed(1)}% de margem`}
          loading={isLoading}
          series={[finance.gross, finance.costs, finance.net].filter((value) => value >= 0)}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.9fr_1fr]">
        <SalesChart points={data?.timeSeries ?? []} loading={isLoading} />
        <ChannelBreakdown channels={channels} total={sales.total.amount} loading={isLoading} />
        <TopProducts products={data?.topProducts ?? []} loading={isLoading} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr_1fr]">
        <RecentOrders orders={data?.recentOrders ?? []} loading={isLoading} />
        <FinancePanel finance={finance} loading={isLoading} />
        <NotificationsPanel notifications={data?.notifications ?? []} loading={isLoading} />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  series,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  detail: string;
  loading: boolean;
  series: number[];
}) {
  return (
    <Card className="min-h-36 overflow-hidden p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-3 h-7 w-28" />
          ) : (
            <p className="nums mt-2 truncate text-2xl font-semibold">{value}</p>
          )}
          <p className="mt-1 text-xs text-muted">{detail}</p>
        </div>
      </div>
      <Sparkline values={series} className="mt-4 h-10 w-full" />
    </Card>
  );
}

function SalesChart({ points, loading }: { points: TimePoint[]; loading: boolean }) {
  const values = points.map((point) => point.amount);
  const max = Math.max(...values, 1);
  const path = buildPath(values, 620, 220, 18);
  const area = `${path} L 602 220 L 18 220 Z`;

  return (
    <Card className="min-h-[316px]">
      <PanelHeader title="Vendas ao longo do tempo" action="Últimos 7 dias" />
      {loading ? (
        <Skeleton className="mt-4 h-56 w-full" />
      ) : (
        <div className="mt-4">
          <svg
            viewBox="0 0 640 260"
            className="h-64 w-full"
            role="img"
            aria-label="Vendas ao longo do tempo"
          >
            <defs>
              <linearGradient id="sales-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity="0.34" />
                <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line
                  x1="18"
                  x2="620"
                  y1={18 + tick * 202}
                  y2={18 + tick * 202}
                  stroke="rgb(var(--border))"
                  strokeOpacity="0.55"
                />
                <text x="0" y={22 + tick * 202} className="fill-muted text-[11px]">
                  {formatBRL(max * (1 - tick)).replace(',00', '')}
                </text>
              </g>
            ))}
            {points.length > 1 && <path d={area} fill="url(#sales-area)" />}
            <path
              d={path}
              fill="none"
              stroke="rgb(var(--primary))"
              strokeLinecap="round"
              strokeWidth="4"
            />
            {points.map((point, index) => {
              const x = 18 + (index / Math.max(points.length - 1, 1)) * 584;
              const y = 220 - (point.amount / max) * 202;
              return <circle key={point.date} cx={x} cy={y} r="4" fill="rgb(var(--primary))" />;
            })}
            {points.map((point, index) => (
              <text
                key={`${point.date}-label`}
                x={18 + (index / Math.max(points.length - 1, 1)) * 584}
                y="252"
                textAnchor="middle"
                className="fill-muted text-[11px]"
              >
                {point.label}
              </text>
            ))}
          </svg>
        </div>
      )}
    </Card>
  );
}

function ChannelBreakdown({
  channels,
  total,
  loading,
}: {
  channels: { key: string; label: string; metric: SalesMetric; color: string }[];
  total: number;
  loading: boolean;
}) {
  const gradient = donutGradient(channels, total);

  return (
    <Card className="min-h-[316px]">
      <PanelHeader title="Vendas por canal" />
      {loading ? (
        <Skeleton className="mt-4 h-56 w-full" />
      ) : (
        <div className="mt-5 grid items-center gap-5 sm:grid-cols-[180px_1fr] xl:grid-cols-1 2xl:grid-cols-[180px_1fr]">
          <div
            className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full"
            style={{ background: gradient }}
            aria-label="Distribuição de vendas por canal"
          >
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-surface text-center">
              <p className="nums text-sm font-semibold">{formatBRL(total)}</p>
              <p className="mt-0.5 text-xs text-muted">Total</p>
            </div>
          </div>
          <div className="space-y-3">
            {channels.map((channel) => {
              const percent = total > 0 ? (channel.metric.amount / total) * 100 : 0;
              return (
                <div key={channel.key} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-muted">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: channel.color }}
                      />
                      {channel.label}
                    </p>
                    <p className="nums mt-0.5 font-medium">{formatBRL(channel.metric.amount)}</p>
                  </div>
                  <p className="nums text-muted">{percent.toFixed(1)}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function TopProducts({ products, loading }: { products: TopProduct[]; loading: boolean }) {
  const maxUnits = Math.max(...products.map((product) => product.units), 1);
  return (
    <Card className="min-h-[316px]">
      <PanelHeader title="Produtos mais vendidos" action="Top 5" />
      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : products.length ? (
        <div className="mt-4 space-y-3">
          {products.map((product, index) => (
            <div
              key={product.name}
              className="grid grid-cols-[18px_40px_1fr_auto] items-center gap-3"
            >
              <span className="nums text-xs text-muted">{index + 1}</span>
              <ProductThumb product={product} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{product.name}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.max(8, (product.units / maxUnits) * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="nums text-xs text-muted">{product.units} un.</p>
                <p className="nums text-sm">{formatBRL(product.amount)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel icon={Package} text="Nenhum produto vendido ainda." />
      )}
    </Card>
  );
}

function RecentOrders({ orders, loading }: { orders: RecentOrder[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="p-5 pb-3">
        <PanelHeader title="Pedidos recentes" action="Ver todos" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border bg-surface-2/70 text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="px-5 py-3">Pedido</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3">Canal</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-5 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))}
            {!loading &&
              orders.map((order) => (
                <tr key={order.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 font-medium">{order.externalOrderId || '-'}</td>
                  <td className="px-3 py-3 text-muted">{order.customer}</td>
                  <td className="px-3 py-3">{marketplaceLabel(order.marketplace)}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="nums px-3 py-3 text-right">{formatBRL(order.amount)}</td>
                  <td className="px-5 py-3 text-muted">{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            {!loading && !orders.length && (
              <tr>
                <td colSpan={6}>
                  <EmptyPanel icon={ClipboardList} text="Nenhum pedido sincronizado ainda." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FinancePanel({ finance, loading }: { finance: FinanceSummary; loading: boolean }) {
  const items = [
    { label: 'Faturamento bruto', value: formatBRL(finance.gross) },
    { label: 'Custos', value: formatBRL(finance.costs) },
    { label: 'Lucro líquido', value: formatBRL(finance.net) },
    { label: 'Margem de lucro', value: `${finance.margin.toFixed(1)}%` },
  ];

  return (
    <Card>
      <PanelHeader title="Resumo financeiro" action="Este mês" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-surface-2/60 p-4">
            <p className="text-xs text-muted">{item.label}</p>
            {loading ? (
              <Skeleton className="mt-3 h-7 w-24" />
            ) : (
              <p className="nums mt-2 text-xl font-semibold">{item.value}</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-surface-2/45 px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">A pagar</span>
          <span className="nums font-medium">{formatBRL(finance.pending)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-muted">Pago</span>
          <span className="nums font-medium">{formatBRL(finance.paid)}</span>
        </div>
      </div>
    </Card>
  );
}

function NotificationsPanel({
  notifications,
  loading,
}: {
  notifications: DashboardNotification[];
  loading: boolean;
}) {
  return (
    <Card>
      <PanelHeader title="Notificações" action="Ver todas" />
      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : notifications.length ? (
        <div className="mt-4 divide-y divide-border/70">
          {notifications.map((notification) => (
            <div key={notification.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className={cn(
                  'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  notification.tone === 'success'
                    ? 'bg-success/12 text-success'
                    : notification.tone === 'warning'
                      ? 'bg-warning/15 text-warning'
                      : notification.tone === 'error'
                        ? 'bg-danger/12 text-danger'
                        : 'bg-primary/10 text-primary',
                )}
              >
                <Bell size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{notification.title}</p>
                  <span className="shrink-0 text-xs text-muted">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{notification.message}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel icon={Bell} text="Nenhuma notificação nova." />
      )}
    </Card>
  );
}

function PanelHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold">{title}</p>
      {action && (
        <span className="inline-flex h-8 items-center gap-1 rounded-xl border border-border bg-surface-2 px-3 text-xs text-muted">
          {action}
          <ChevronDown size={13} />
        </span>
      )}
    </div>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const safeValues = values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const path = buildPath(safeValues, 180, 42, 4);
  return (
    <svg viewBox="0 0 180 46" className={className} aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="rgb(var(--primary))"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function ProductThumb({ product }: { product: TopProduct }) {
  if (product.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.imageUrl}
        alt=""
        className="h-10 w-10 rounded-xl object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted ring-1 ring-border">
      <Package size={17} />
    </span>
  );
}

function EmptyPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-muted">
      <Icon size={24} />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function buildPath(values: number[], width: number, height: number, padding: number): string {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function donutGradient(channels: { metric: SalesMetric; color: string }[], total: number): string {
  if (total <= 0) return 'conic-gradient(rgb(var(--surface-3)) 0deg 360deg)';
  let start = 0;
  const stops = channels.map((channel) => {
    const end = start + (channel.metric.amount / total) * 360;
    const stop = `${channel.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function marketplaceLabel(value: string): string {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'shopee') return 'Shopee';
  if (['mercadolivre', 'mercadolibre', 'ml', 'meli'].includes(normalized)) return 'Mercado Livre';
  return value || '-';
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
