'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, ClipboardList, Package, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface SupplierDashboard {
  products: number;
  lowStock: number;
  orders: Record<string, number>;
  financial: { _id: string; total: number }[];
}

export default function SupplierDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-dashboard'],
    queryFn: () => api.get<SupplierDashboard>('/dropshipping/supplier/dashboard'),
    refetchInterval: 10000,
  });

  const pendingAmount = data?.financial.find((f) => f._id === 'pending')?.total ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Visão geral" subtitle="Operação do fornecedor em tempo real" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          icon={Package}
          label="Produtos ativos"
          value={data?.products ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={Boxes}
          label="Estoque baixo"
          value={data?.lowStock ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={ClipboardList}
          label="Novos pedidos"
          value={data?.orders.new ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={AlertTriangle}
          label="Cancelados"
          value={data?.orders.canceled ?? 0}
          loading={isLoading}
        />
        <Metric
          icon={Wallet}
          label="A receber"
          value={pendingAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          loading={isLoading}
        />
      </div>
      <Card className="mt-4">
        <p className="text-sm font-semibold">Checklist de ativação</p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            'Dados da empresa preenchidos',
            'Logo cadastrada',
            'Endereço de origem cadastrado',
            'Primeiro produto cadastrado',
            'Políticas cadastradas',
            'Conta aprovada pelo administrador',
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
  icon: typeof Package;
  label: string;
  value: string | number;
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
