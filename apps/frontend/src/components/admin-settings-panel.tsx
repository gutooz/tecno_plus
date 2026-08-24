'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  QrCode,
  RefreshCcw,
  Save,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input, Skeleton } from '@/components/ui';

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

type AsaasBillingType = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD';

interface AsaasConfigResponse {
  configured: boolean;
  environment: string;
  baseUrl: string;
  webhookConfigured: boolean;
  missing: string[];
}

interface AsaasCustomerResponse {
  id: string;
}

interface AsaasPaymentResponse {
  id: string;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: AsaasBillingType;
}

interface AsaasPixQrCodeResponse {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}

interface AsaasTestForm {
  name: string;
  cpfCnpj: string;
  email: string;
  value: number;
  billingType: AsaasBillingType;
  description: string;
}

interface AsaasTestResult {
  customerId: string;
  payment: AsaasPaymentResponse;
  pix?: AsaasPixQrCodeResponse;
}

interface MercadoPagoConfigResponse {
  configured: boolean;
  environment: string;
  baseUrl: string;
  webhookUrl: string;
  webhookConfigured: boolean;
  missing: string[];
}

interface MercadoPagoPaymentResponse {
  id: number;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
}

interface MercadoPagoPixResponse {
  encodedImage?: string;
  payload?: string;
  ticketUrl?: string;
}

interface MercadoPagoPixCreateResponse {
  payment: MercadoPagoPaymentResponse;
  pix?: MercadoPagoPixResponse;
}

interface MercadoPagoTestForm {
  payerName: string;
  payerEmail: string;
  payerDocumentNumber: string;
  payerDocumentType: 'CPF' | 'CNPJ';
  value: number;
  description: string;
}

interface MercadoPagoTestResult {
  payment: MercadoPagoPaymentResponse;
  pix?: MercadoPagoPixResponse;
}

const ASAAS_TEST_RESULT_STORAGE_KEY = 'tecnoplus:last-asaas-test-result';
const MERCADO_PAGO_TEST_RESULT_STORAGE_KEY = 'tecnoplus:last-mercado-pago-test-result';
const ASAAS_PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);
const MERCADO_PAGO_PAID_STATUSES = new Set(['APPROVED']);

const DEFAULT_ASAAS_TEST_FORM: AsaasTestForm = {
  name: 'Cliente teste zycron',
  cpfCnpj: '',
  email: '',
  value: 1,
  billingType: 'UNDEFINED',
  description: 'Cobrança de teste zycron',
};

const DEFAULT_MERCADO_PAGO_TEST_FORM: MercadoPagoTestForm = {
  payerName: 'Cliente teste zycron',
  payerEmail: '',
  payerDocumentNumber: '',
  payerDocumentType: 'CPF',
  value: 1,
  description: 'Cobrança Pix teste zycron',
};

export function AdminSettingsPanel() {
  const qc = useQueryClient();
  const [rules, setRules] = useState<PlatformFeeRule[]>([]);
  const [asaasForm, setAsaasForm] = useState<AsaasTestForm>(DEFAULT_ASAAS_TEST_FORM);
  const [asaasResult, setAsaasResult] = useState<AsaasTestResult | null>(null);
  const [mercadoPagoForm, setMercadoPagoForm] = useState<MercadoPagoTestForm>(
    DEFAULT_MERCADO_PAGO_TEST_FORM,
  );
  const [mercadoPagoResult, setMercadoPagoResult] = useState<MercadoPagoTestResult | null>(null);
  const paymentId = asaasResult?.payment.id;
  const paymentStatus = asaasResult?.payment.status?.toUpperCase() ?? '';
  const paymentPaid = ASAAS_PAID_STATUSES.has(paymentStatus);
  const mercadoPagoPaymentId = mercadoPagoResult?.payment.id;
  const mercadoPagoPaymentStatus = mercadoPagoResult?.payment.status?.toUpperCase() ?? '';
  const mercadoPagoPaymentPaid = MERCADO_PAGO_PAID_STATUSES.has(mercadoPagoPaymentStatus);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<AdminDashboard>('/dropshipping/admin/dashboard'),
  });
  const feeRules = useQuery({
    queryKey: ['admin-platform-fee-rules'],
    queryFn: () => api.get<PlatformFeeRulesResponse>('/dropshipping/admin/platform-fee-rules'),
  });
  const asaasConfig = useQuery({
    queryKey: ['asaas-config'],
    queryFn: () => api.get<AsaasConfigResponse>('/asaas/config'),
  });
  const mercadoPagoConfig = useQuery({
    queryKey: ['mercado-pago-config'],
    queryFn: () => api.get<MercadoPagoConfigResponse>('/mercado-pago/config'),
  });
  const asaasPaymentStatus = useQuery({
    queryKey: ['asaas-payment-status', paymentId],
    queryFn: () =>
      api.get<AsaasPaymentResponse>(`/asaas/payments/${encodeURIComponent(paymentId!)}`),
    enabled: Boolean(paymentId) && !paymentPaid,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  const mercadoPagoStatusQuery = useQuery({
    queryKey: ['mercado-pago-payment-status', mercadoPagoPaymentId],
    queryFn: () =>
      api.get<MercadoPagoPaymentResponse>(
        `/mercado-pago/payments/${encodeURIComponent(String(mercadoPagoPaymentId!))}`,
      ),
    enabled: Boolean(mercadoPagoPaymentId) && !mercadoPagoPaymentPaid,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (feeRules.data?.rules) setRules(feeRules.data.rules);
  }, [feeRules.data?.rules]);

  useEffect(() => {
    const stored = window.localStorage.getItem(ASAAS_TEST_RESULT_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as AsaasTestResult;
      if (parsed.payment?.id && parsed.customerId) setAsaasResult(parsed);
    } catch {
      window.localStorage.removeItem(ASAAS_TEST_RESULT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(MERCADO_PAGO_TEST_RESULT_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as MercadoPagoTestResult;
      if (parsed.payment?.id) setMercadoPagoResult(parsed);
    } catch {
      window.localStorage.removeItem(MERCADO_PAGO_TEST_RESULT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('asaasPaymentId')?.trim();
    const customerId = params.get('asaasCustomerId')?.trim();
    if (!id?.startsWith('pay_') || !customerId?.startsWith('cus_')) return;
    setAsaasResult({ customerId, payment: { id } });
  }, []);

  useEffect(() => {
    if (!asaasResult) return;
    window.localStorage.setItem(ASAAS_TEST_RESULT_STORAGE_KEY, JSON.stringify(asaasResult));
  }, [asaasResult]);

  useEffect(() => {
    if (!mercadoPagoResult) return;
    window.localStorage.setItem(
      MERCADO_PAGO_TEST_RESULT_STORAGE_KEY,
      JSON.stringify(mercadoPagoResult),
    );
  }, [mercadoPagoResult]);

  useEffect(() => {
    if (!asaasPaymentStatus.data) return;
    setAsaasResult((current) =>
      current?.payment.id === asaasPaymentStatus.data.id
        ? { ...current, payment: { ...current.payment, ...asaasPaymentStatus.data } }
        : current,
    );
  }, [asaasPaymentStatus.data]);

  useEffect(() => {
    if (!mercadoPagoStatusQuery.data) return;
    setMercadoPagoResult((current) =>
      current?.payment.id === mercadoPagoStatusQuery.data.id
        ? { ...current, payment: { ...current.payment, ...mercadoPagoStatusQuery.data } }
        : current,
    );
  }, [mercadoPagoStatusQuery.data]);

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

  const createAsaasTestCharge = useMutation({
    mutationFn: async () => {
      const customer = await api.post<AsaasCustomerResponse>('/asaas/customers', {
        name: asaasForm.name,
        cpfCnpj: asaasForm.cpfCnpj,
        email: asaasForm.email,
        externalReference: `settings-test-${Date.now()}`,
        notificationDisabled: true,
      });
      const payment = await api.post<AsaasPaymentResponse>('/asaas/payments', {
        customer: customer.id,
        billingType: asaasForm.billingType,
        value: asaasForm.value,
        dueDate: new Date().toISOString().slice(0, 10),
        description: asaasForm.description,
        externalReference: `settings-test-payment-${Date.now()}`,
      });
      let pix: AsaasPixQrCodeResponse | undefined;
      if (asaasForm.billingType === 'PIX' || asaasForm.billingType === 'UNDEFINED') {
        pix = await api.get<AsaasPixQrCodeResponse>(
          `/asaas/payments/${encodeURIComponent(payment.id)}/pix-qrcode`,
        );
      }
      return { customerId: customer.id, payment, pix };
    },
    onSuccess: (response) => {
      setAsaasResult(response);
      qc.setQueryData(['asaas-payment-status', response.payment.id], response.payment);
    },
  });

  const createMercadoPagoTestCharge = useMutation({
    mutationFn: () =>
      api.post<MercadoPagoPixCreateResponse>('/mercado-pago/payments/pix', {
        transactionAmount: mercadoPagoForm.value,
        description: mercadoPagoForm.description,
        payerEmail: mercadoPagoForm.payerEmail,
        payerName: mercadoPagoForm.payerName,
        payerDocumentType: mercadoPagoForm.payerDocumentType,
        payerDocumentNumber: mercadoPagoForm.payerDocumentNumber,
        externalReference: `settings-test-mercado-pago-${Date.now()}`,
      }),
    onSuccess: (response) => {
      setMercadoPagoResult(response);
      qc.setQueryData(['mercado-pago-payment-status', response.payment.id], response.payment);
    },
  });

  const updateAsaasForm = <Key extends keyof AsaasTestForm>(
    key: Key,
    value: AsaasTestForm[Key],
  ) => {
    setAsaasResult(null);
    window.localStorage.removeItem(ASAAS_TEST_RESULT_STORAGE_KEY);
    setAsaasForm((current) => ({ ...current, [key]: value }));
  };

  const updateMercadoPagoForm = <Key extends keyof MercadoPagoTestForm>(
    key: Key,
    value: MercadoPagoTestForm[Key],
  ) => {
    setMercadoPagoResult(null);
    window.localStorage.removeItem(MERCADO_PAGO_TEST_RESULT_STORAGE_KEY);
    setMercadoPagoForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="mb-4 space-y-4" aria-labelledby="admin-settings-title">
      <div>
        <h2 id="admin-settings-title" className="text-base font-semibold">
          Administração da plataforma
        </h2>
        <p className="mt-1 text-sm text-muted">
          Fila de aprovação, exceções, integrações e regra de taxa do Shopping.
        </p>
      </div>

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

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Taxa da plataforma por faixa</h3>
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

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <QrCode size={17} />
              </span>
              <div>
                <h3 className="text-base font-semibold">Teste Mercado Pago</h3>
                <p className="mt-1 text-sm text-muted">
                  Gere uma cobrança Pix simples para comparar taxa e fluxo de confirmação.
                </p>
              </div>
            </div>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              mercadoPagoConfig.data?.configured
                ? 'bg-success/14 text-success'
                : 'bg-warning/15 text-warning'
            }`}
          >
            <CheckCircle2 size={14} />
            {mercadoPagoConfig.data?.configured
              ? `${mercadoPagoConfig.data.environment} conectado`
              : 'Configuração pendente'}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-warning/25 bg-warning/[0.04] px-3 py-2 text-xs text-muted">
          Em produção, essa cobrança Pix é real. Use valor baixo e pague só quando quiser validar o
          ciclo completo.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Nome do pagador"
            value={mercadoPagoForm.payerName}
            onChange={(event) => updateMercadoPagoForm('payerName', event.target.value)}
          />
          <Input
            placeholder="Email do pagador"
            type="email"
            value={mercadoPagoForm.payerEmail}
            onChange={(event) => updateMercadoPagoForm('payerEmail', event.target.value)}
          />
          <label className="text-xs font-medium text-muted">
            Documento
            <select
              value={mercadoPagoForm.payerDocumentType}
              onChange={(event) =>
                updateMercadoPagoForm(
                  'payerDocumentType',
                  event.target.value as MercadoPagoTestForm['payerDocumentType'],
                )
              }
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg outline-none transition-all duration-200 ease-out-soft focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
          </label>
          <Input
            placeholder="Número do documento"
            value={mercadoPagoForm.payerDocumentNumber}
            onChange={(event) => updateMercadoPagoForm('payerDocumentNumber', event.target.value)}
          />
          <Input
            placeholder="Valor"
            type="number"
            min={1}
            step="0.01"
            className="nums"
            value={mercadoPagoForm.value}
            onChange={(event) => updateMercadoPagoForm('value', Number(event.target.value))}
          />
          <Input
            placeholder="Descrição"
            value={mercadoPagoForm.description}
            onChange={(event) => updateMercadoPagoForm('description', event.target.value)}
          />
        </div>

        {mercadoPagoConfig.data && !mercadoPagoConfig.data.configured && (
          <p className="mt-3 text-xs text-warning">
            Configure {mercadoPagoConfig.data.missing.join(', ')} no backend antes de gerar o Pix.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={createMercadoPagoTestCharge.isPending}
            disabled={
              !mercadoPagoConfig.data?.configured ||
              !mercadoPagoForm.payerEmail ||
              !mercadoPagoForm.payerDocumentNumber
            }
            onClick={() => createMercadoPagoTestCharge.mutate()}
          >
            <QrCode size={15} />
            Gerar Pix Mercado Pago
          </Button>
          {mercadoPagoResult?.pix?.ticketUrl && (
            <a
              href={mercadoPagoResult.pix.ticketUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-xs transition hover:bg-surface-2"
            >
              <ExternalLink size={15} />
              Abrir pagamento
            </a>
          )}
        </div>

        {createMercadoPagoTestCharge.error && (
          <p className="mt-3 text-xs text-danger">
            {createMercadoPagoTestCharge.error instanceof Error
              ? createMercadoPagoTestCharge.error.message
              : 'Falha ao gerar Pix Mercado Pago.'}
          </p>
        )}

        {mercadoPagoResult && (
          <div
            className={`mt-4 rounded-2xl border p-3 ${
              mercadoPagoPaymentPaid
                ? 'border-success/35 bg-success/[0.08]'
                : 'border-border bg-surface-2/60'
            }`}
          >
            <div className="grid gap-3 md:grid-cols-[auto_1fr]">
              {mercadoPagoResult.pix?.encodedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${mercadoPagoResult.pix.encodedImage}`}
                  alt=""
                  className="h-28 w-28 rounded-xl bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-surface">
                  <QrCode size={28} className="text-muted" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">
                    {mercadoPagoPaymentPaid ? 'Pagamento confirmado. Obrigado!' : 'Pix criado'}
                  </p>
                  {mercadoPagoPaymentStatus && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        mercadoPagoPaymentPaid
                          ? 'bg-success/14 text-success'
                          : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {mercadoPagoPaymentStatus}
                    </span>
                  )}
                </div>
                {mercadoPagoPaymentPaid ? (
                  <p className="mt-1 text-xs text-success">
                    Recebemos o pagamento da cobrança teste. O ciclo Mercado Pago está funcionando.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    Aguardando confirmação do Mercado Pago. A página verifica automaticamente a cada
                    5 segundos.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Pagamento: <span className="nums">{mercadoPagoResult.payment.id}</span>
                </p>
                {mercadoPagoResult.pix?.payload && (
                  <div className="mt-3">
                    <p className="line-clamp-2 break-all text-xs text-muted">
                      {mercadoPagoResult.pix.payload}
                    </p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigator.clipboard.writeText(mercadoPagoResult.pix?.payload ?? '')
                      }
                    >
                      <Copy size={14} />
                      Copiar Pix
                    </Button>
                  </div>
                )}
                {!mercadoPagoPaymentPaid && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    loading={mercadoPagoStatusQuery.isFetching}
                    onClick={() => mercadoPagoStatusQuery.refetch()}
                  >
                    <RefreshCcw size={14} />
                    Verificar pagamento
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CreditCard size={17} />
              </span>
              <div>
                <h3 className="text-base font-semibold">Teste Asaas</h3>
                <p className="mt-1 text-sm text-muted">
                  Gere uma cobrança mínima para validar fatura, Pix e webhook de cobrança.
                </p>
              </div>
            </div>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              asaasConfig.data?.configured
                ? 'bg-success/14 text-success'
                : 'bg-warning/15 text-warning'
            }`}
          >
            <CheckCircle2 size={14} />
            {asaasConfig.data?.configured
              ? `${asaasConfig.data.environment} conectado`
              : 'Configuração pendente'}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-warning/25 bg-warning/[0.04] px-3 py-2 text-xs text-muted">
          Em produção, essa cobrança é real. Use valor baixo e pague só quando quiser testar o ciclo
          completo.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Nome do cliente"
            value={asaasForm.name}
            onChange={(event) => updateAsaasForm('name', event.target.value)}
          />
          <Input
            placeholder="CPF/CNPJ do cliente"
            value={asaasForm.cpfCnpj}
            onChange={(event) => updateAsaasForm('cpfCnpj', event.target.value)}
          />
          <Input
            placeholder="Email do cliente"
            type="email"
            value={asaasForm.email}
            onChange={(event) => updateAsaasForm('email', event.target.value)}
          />
          <Input
            placeholder="Valor"
            type="number"
            min={1}
            step="0.01"
            className="nums"
            value={asaasForm.value}
            onChange={(event) => updateAsaasForm('value', Number(event.target.value))}
          />
          <label className="text-xs font-medium text-muted md:col-span-2">
            Forma de pagamento
            <select
              value={asaasForm.billingType}
              onChange={(event) =>
                updateAsaasForm('billingType', event.target.value as AsaasBillingType)
              }
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg outline-none transition-all duration-200 ease-out-soft focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option value="UNDEFINED">Fatura Asaas: pagador escolhe Pix ou cartão</option>
              <option value="PIX">Pix direto</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDIT_CARD">Cartão via fatura Asaas</option>
            </select>
          </label>
          <Input
            placeholder="Descrição"
            className="md:col-span-2"
            value={asaasForm.description}
            onChange={(event) => updateAsaasForm('description', event.target.value)}
          />
        </div>

        {asaasConfig.data && !asaasConfig.data.configured && (
          <p className="mt-3 text-xs text-warning">
            Configure {asaasConfig.data.missing.join(', ')} no backend antes de gerar a cobrança.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={createAsaasTestCharge.isPending}
            disabled={!asaasConfig.data?.configured || !asaasForm.cpfCnpj || !asaasForm.email}
            onClick={() => createAsaasTestCharge.mutate()}
          >
            <QrCode size={15} />
            Gerar cobrança teste
          </Button>
          {asaasResult?.payment.invoiceUrl && (
            <a
              href={asaasResult.payment.invoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-xs transition hover:bg-surface-2"
            >
              <ExternalLink size={15} />
              Abrir fatura
            </a>
          )}
        </div>

        {createAsaasTestCharge.error && (
          <p className="mt-3 text-xs text-danger">
            {createAsaasTestCharge.error instanceof Error
              ? createAsaasTestCharge.error.message
              : 'Falha ao gerar cobrança Asaas.'}
          </p>
        )}

        {asaasResult && (
          <div
            className={`mt-4 rounded-2xl border p-3 ${
              paymentPaid ? 'border-success/35 bg-success/[0.08]' : 'border-border bg-surface-2/60'
            }`}
          >
            <div className="grid gap-3 md:grid-cols-[auto_1fr]">
              {asaasResult.pix?.encodedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${asaasResult.pix.encodedImage}`}
                  alt=""
                  className="h-28 w-28 rounded-xl bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-surface">
                  <CreditCard size={28} className="text-muted" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">
                    {paymentPaid ? 'Pagamento confirmado. Obrigado!' : 'Cobrança criada'}
                  </p>
                  {paymentStatus && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        paymentPaid ? 'bg-success/14 text-success' : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {paymentStatus}
                    </span>
                  )}
                </div>
                {paymentPaid ? (
                  <p className="mt-1 text-xs text-success">
                    Recebemos o pagamento da cobrança teste. O ciclo do Asaas está funcionando.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    Aguardando confirmação do Asaas. A página verifica automaticamente a cada 5
                    segundos.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Pagamento: <span className="nums">{asaasResult.payment.id}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  Cliente: <span className="nums">{asaasResult.customerId}</span>
                </p>
                {asaasResult.pix?.payload && (
                  <div className="mt-3">
                    <p className="line-clamp-2 break-all text-xs text-muted">
                      {asaasResult.pix.payload}
                    </p>
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(asaasResult.pix?.payload ?? '')}
                    >
                      <Copy size={14} />
                      Copiar Pix
                    </Button>
                  </div>
                )}
                {!paymentPaid && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    loading={asaasPaymentStatus.isFetching}
                    onClick={() => asaasPaymentStatus.refetch()}
                  >
                    <RefreshCcw size={14} />
                    Verificar pagamento
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </section>
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
