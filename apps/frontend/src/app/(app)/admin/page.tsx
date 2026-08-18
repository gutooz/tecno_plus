'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCcw, Save, ShieldCheck, Store, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface AdminDashboard {
  suppliersPending: number;
  sellersPending: number;
  exceptions: number;
  disconnected: number;
  syncPending: number;
}

interface PlatformFeeRule {
  upTo: number;
  fee: number;
}

interface PlatformFeeRulesResponse {
  rules: PlatformFeeRule[];
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [rules, setRules] = useState<PlatformFeeRule[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<AdminDashboard>('/dropshipping/admin/dashboard'),
  });
  const feeRules = useQuery({
    queryKey: ['admin-platform-fee-rules'],
    queryFn: () => api.get<PlatformFeeRulesResponse>('/dropshipping/admin/platform-fee-rules'),
  });

  useEffect(() => {
    if (feeRules.data?.rules) setRules(feeRules.data.rules);
  }, [feeRules.data?.rules]);

  const saveRules = useMutation({
    mutationFn: () =>
      api.patch<PlatformFeeRulesResponse>('/dropshipping/admin/platform-fee-rules', { rules }),
    onSuccess: (response) => {
      setRules(response.rules);
      qc.setQueryData(['admin-platform-fee-rules'], response);
      qc.invalidateQueries({ queryKey: ['seller-catalog'] });
      qc.invalidateQueries({ queryKey: ['seller-catalog-suppliers'] });
      qc.invalidateQueries({ queryKey: ['seller-finance'] });
    },
  });

  const updateRule = (index: number, key: keyof PlatformFeeRule, value: number) => {
    setRules((current) =>
      current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [key]: value } : rule)),
    );
  };

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

      <Card className="mt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Taxa da plataforma por faixa</h2>
            <p className="mt-1 text-sm text-muted">
              Essa regra define o valor somado ao preço do fornecedor no Shopping e no financeiro.
            </p>
          </div>
          <Button size="sm" loading={saveRules.isPending} onClick={() => saveRules.mutate()}>
            <Save size={15} />
            Salvar regra
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(feeRules.isLoading
            ? [
                { upTo: 0, fee: 0 },
                { upTo: 0, fee: 0 },
                { upTo: 0, fee: 0 },
              ]
            : rules
          ).map((rule, index) => (
            <div key={index} className="rounded-2xl border border-border bg-surface-2/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Faixa {index + 1}
              </p>
              {feeRules.isLoading ? (
                <Skeleton className="mt-3 h-20 w-full" />
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-muted">
                    Produto até
                    <Input
                      className="nums mt-1"
                      type="number"
                      min={0}
                      value={rule.upTo}
                      onChange={(event) => updateRule(index, 'upTo', Number(event.target.value))}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Plataforma fica
                    <Input
                      className="nums mt-1"
                      type="number"
                      min={0}
                      value={rule.fee}
                      onChange={(event) => updateRule(index, 'fee', Number(event.target.value))}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Regra padrão: até R$ 50 cobra R$ 5, até R$ 100 cobra R$ 10, até R$ 200 cobra R$ 20.
        </p>
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
