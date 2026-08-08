'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCcw, ShieldCheck, Store, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface AdminDashboard {
  suppliersPending: number;
  sellersPending: number;
  exceptions: number;
  disconnected: number;
  syncPending: number;
}

export default function AdminPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<AdminDashboard>('/dropshipping/admin/dashboard'),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Admin"
        subtitle="Fila de aprovação, exceções e integrações da plataforma"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          icon={Truck}
          label="Fornecedores pendentes"
          value={data?.suppliersPending ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={Store}
          label="Vendedores pendentes"
          value={data?.sellersPending ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={AlertTriangle}
          label="Pedidos com problema"
          value={data?.exceptions ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={ShieldCheck}
          label="Contas sem organização"
          value={data?.disconnected ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={RefreshCcw}
          label="Sincronizações pendentes"
          value={data?.syncPending ?? 0}
          loading={isLoading}
        />
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
  icon: typeof Truck;
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
