'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, CreditCard, QrCode, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface FinanceEntry {
  id: string;
  supplierOrderId: string;
  externalOrderId?: string;
  status: string;
  amounts: {
    supplierAmount?: number;
    platformFee?: number;
    sellerChargeAmount?: number;
    saleAmount?: number;
  };
  supplier?: { id: string; name?: string; email?: string } | null;
  gatewayPaymentId?: string;
  proofUrl?: string;
  pix?: {
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
    invoiceUrl?: string;
    mode?: string;
  };
  createdAt?: string;
  paidAt?: string;
}

interface FinanceResponse {
  items: FinanceEntry[];
  totals: {
    pending: number;
    paid: number;
    platformFees: number;
    supplierCosts: number;
  };
}

export default function SellerFinancePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['seller-finance'],
    queryFn: () => api.get<FinanceResponse>('/dropshipping/seller/finance'),
    refetchInterval: 10000,
  });

  const generatePix = useMutation({
    mutationFn: (entryId: string) =>
      api.post<FinanceResponse>(`/dropshipping/seller/finance/${entryId}/pix`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-finance'] }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Financeiro"
        subtitle="Cobrança por fornecedor: valor do fornecedor + taxa configurada da plataforma"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="A pagar" value={money(data?.totals.pending ?? 0)} loading={isLoading} />
        <Metric label="Pago" value={money(data?.totals.paid ?? 0)} loading={isLoading} />
        <Metric
          label="Taxas do sistema"
          value={money(data?.totals.platformFees ?? 0)}
          loading={isLoading}
        />
        <Metric
          label="Custo fornecedor"
          value={money(data?.totals.supplierCosts ?? 0)}
          loading={isLoading}
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">Método de pagamento</p>
            <p className="mt-1 text-sm text-muted">
              Pix fica disponível com QR Code. Cartão salvo ficará pronto para débito automático via
              Stripe.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
            <div className="rounded-2xl border border-primary/35 bg-primary/10 px-3 py-2 text-primary">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <QrCode size={16} />
                Pix QR Code
              </div>
              <p className="mt-1 text-xs text-muted">Disponível agora</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface-2/60 px-3 py-2 text-muted">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <WalletCards size={16} />
                Cartão salvo
              </div>
              <p className="mt-1 text-xs text-muted">Stripe em preparação</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-3xl" />
          ))}

        {data?.items.map((entry) => (
          <Card key={entry.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{entry.externalOrderId || entry.supplierOrderId}</p>
                  <StatusPill status={entry.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  Fornecedor: {entry.supplier?.name || entry.supplier?.email || '-'}
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <Info label="Valor fornecedor" value={money(entry.amounts.supplierAmount ?? 0)} />
                  <Info label="Taxa plataforma" value={money(entry.amounts.platformFee ?? 0)} />
                  <Info
                    label="Total a debitar"
                    value={money(entry.amounts.sellerChargeAmount ?? 0)}
                  />
                </div>
              </div>

              <div className="w-full max-w-md">
                {entry.pix?.payload ? (
                  <PixBox entry={entry} />
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                    <Button
                      loading={generatePix.isPending}
                      onClick={() => generatePix.mutate(entry.id)}
                      className="w-full sm:w-auto"
                    >
                      <QrCode size={16} />
                      Gerar Pix
                    </Button>
                    <Button type="button" variant="outline" disabled className="w-full sm:w-auto">
                      <WalletCards size={16} />
                      Debitar cartão
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {!isLoading && !data?.items.length && (
          <Card className="flex items-center gap-3 text-sm text-muted">
            <CreditCard size={18} className="text-primary" />
            Nenhuma cobrança financeira criada ainda.
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <p className="text-xs font-medium text-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="nums mt-2 text-2xl font-semibold">{value}</p>
      )}
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="nums mt-1 font-medium">{value}</p>
    </div>
  );
}

function PixBox({ entry }: { entry: FinanceEntry }) {
  const payload = entry.pix?.payload ?? '';
  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 p-3">
      <div className="flex gap-3">
        {entry.pix?.encodedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${entry.pix.encodedImage}`}
            alt=""
            className="h-24 w-24 rounded-xl bg-white object-contain p-1"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-surface">
            <QrCode size={30} className="text-muted" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Pix gerado</p>
          <p className="mt-1 line-clamp-3 break-all text-xs text-muted">{payload}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(payload)}
            >
              <Copy size={14} />
              Copiar Pix
            </Button>
            {entry.proofUrl && (
              <a
                href={entry.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-xs transition hover:bg-surface-2"
              >
                Abrir cobrança
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
