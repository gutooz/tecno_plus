'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, ClipboardList, Package, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface SellerDashboard {
  catalogAvailable: number;
  listings: number;
  orders: number;
  unread: number;
}

export default function SellerDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['seller-dashboard'],
    queryFn: () => api.get<SellerDashboard>('/dropshipping/seller/dashboard'),
    refetchInterval: 10000,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Visão geral" subtitle="Produtos, anúncios e pedidos da loja vendedora" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Store}
          label="Produtos no catálogo"
          value={data?.catalogAvailable ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={Package}
          label="Meus produtos"
          value={data?.listings ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={ClipboardList}
          label="Pedidos"
          value={data?.orders ?? 0}
          loading={isLoading}
        />
        <Metric icon={Bell} label="Notificações" value={data?.unread ?? 0} loading={isLoading} />
      </div>
      <Card className="mt-4">
        <p className="text-sm font-semibold">Checklist de ativação</p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            'Perfil preenchido',
            'Loja da Shopee conectada',
            'Primeiro fornecedor selecionado',
            'Primeiro produto importado',
            'Margem de lucro configurada',
            'Primeiro anúncio publicado',
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-muted"
            >
              {item}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Store;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon size={18} />
      </span>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="nums text-2xl font-semibold">{value}</p>
      )}
      <p className="text-xs font-medium text-muted">{label}</p>
    </Card>
  );
}
