'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCcw,
  Search,
  Send,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Checkbox, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn, formatBRL } from '@/lib/utils';

interface WhatsAppStatus {
  config: {
    configured: boolean;
    baseUrl: string;
    session: string;
    webhookUrl?: string;
    missing?: string[];
  };
  connected: boolean;
  status: unknown;
  connection: unknown;
  error?: string | null;
}

interface WhatsAppProduct {
  id: string;
  title: string;
  price?: number;
  link: string;
  sku: string;
  thumbnail?: string;
  status: string;
}

interface ProductsResponse {
  items: WhatsAppProduct[];
  total: number;
  page: number;
  pages: number;
}

interface PreviewResponse {
  phones: string[];
  products: WhatsAppProduct[];
  message: string;
}

interface SendResponse {
  sent: number;
  failed: number;
  results: Array<{ phone: string; ok: boolean; error?: string }>;
  message: string;
}

function qrSrc(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('data:image')) return value;
  return `data:image/png;base64,${value.replace(/^data:image\/\w+;base64,/, '')}`;
}

export default function AdminWhatsAppPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [phones, setPhones] = useState('');
  const [intro, setIntro] = useState('Olá! Separei estes produtos para você:');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [sendResult, setSendResult] = useState<SendResponse | null>(null);

  const status = useQuery({
    queryKey: ['admin-whatsapp-status'],
    queryFn: () => api.get<WhatsAppStatus>('/whatsapp/status'),
    refetchInterval: 6000,
  });

  const products = useQuery({
    queryKey: ['admin-whatsapp-products', search],
    queryFn: () =>
      api.get<ProductsResponse>(`/whatsapp/products?search=${encodeURIComponent(search)}&limit=18`),
  });

  const start = useMutation({
    mutationFn: () => api.post<{ qrCode?: string | null }>('/whatsapp/start'),
    onSuccess: (data) => {
      setQrCodeValue(data.qrCode ?? null);
      qc.invalidateQueries({ queryKey: ['admin-whatsapp-status'] });
    },
  });

  const refreshQr = useMutation({
    mutationFn: () => api.get<{ qrCode?: string | null }>('/whatsapp/qr-code'),
    onSuccess: (data) => setQrCodeValue(data.qrCode ?? null),
  });

  const logout = useMutation({
    mutationFn: () => api.post('/whatsapp/logout'),
    onSuccess: () => {
      setQrCodeValue(null);
      qc.invalidateQueries({ queryKey: ['admin-whatsapp-status'] });
    },
  });

  const makePreview = useMutation({
    mutationFn: () =>
      api.post<PreviewResponse>('/whatsapp/preview-products', {
        phones,
        productIds: [...selected],
        intro,
        includePrice: true,
      }),
    onSuccess: (data) => {
      setPreview(data);
      setSendResult(null);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      api.post<SendResponse>('/whatsapp/send-products', {
        phones,
        productIds: [...selected],
        intro,
        includePrice: true,
      }),
    onSuccess: (data) => {
      setSendResult(data);
      setPreview({
        phones: data.results.map((item) => item.phone),
        products: [],
        message: data.message,
      });
    },
  });

  const qr = qrSrc(qrCodeValue);
  const connected = Boolean(status.data?.connected);
  const selectedProducts = useMemo(
    () => products.data?.items.filter((product) => selected.has(product.id)) ?? [],
    [products.data?.items, selected],
  );

  function toggleProduct(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const ids = products.data?.items.map((product) => product.id) ?? [];
    setSelected((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      if (allSelected) return new Set([...current].filter((id) => !ids.includes(id)));
      return new Set([...current, ...ids]);
    });
  }

  const visibleProducts = products.data?.items ?? [];
  const allVisibleSelected =
    visibleProducts.length > 0 && visibleProducts.every((product) => selected.has(product.id));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="WhatsApp" subtitle="Conexão WPPConnect e disparo de produtos">
        <Button
          size="sm"
          variant="outline"
          loading={status.isFetching}
          onClick={() => status.refetch()}
        >
          {!status.isFetching && <RefreshCcw size={15} />}
          Atualizar
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold">Sessão</p>
              <p className="mt-1 text-sm text-muted">
                {status.data?.config.session ?? 'tecnoplus'} ·{' '}
                {status.data?.config.baseUrl ?? 'http://localhost:21465'}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                connected ? 'bg-success/14 text-success' : 'bg-warning/15 text-warning',
              )}
            >
              {connected ? <CheckCircle2 size={14} /> : <Smartphone size={14} />}
              {connected ? 'Conectado' : 'Aguardando QR'}
            </span>
          </div>

          {status.data?.config.missing?.length ? (
            <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/[0.08] p-3 text-sm text-warning">
              Falta configurar: {status.data.config.missing.join(', ')}
            </div>
          ) : null}

          <div className="mt-5 flex min-h-64 items-center justify-center rounded-3xl border border-border bg-surface-2 p-4">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="QR Code do WhatsApp"
                className="h-56 w-56 rounded-2xl bg-white p-2"
              />
            ) : connected ? (
              <div className="text-center">
                <CheckCircle2 size={40} className="mx-auto text-success" />
                <p className="mt-2 text-sm font-medium">WhatsApp conectado</p>
              </div>
            ) : (
              <div className="text-center">
                <QrCode size={42} className="mx-auto text-faint" />
                <p className="mt-2 text-sm font-medium">QR Code indisponível</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" loading={start.isPending} onClick={() => start.mutate()}>
              {!start.isPending && <QrCode size={15} />}
              Iniciar sessão
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={refreshQr.isPending}
              onClick={() => refreshQr.mutate()}
            >
              {!refreshQr.isPending && <RefreshCcw size={15} />}
              Novo QR
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={logout.isPending}
              onClick={() => confirm('Desconectar o WhatsApp?') && logout.mutate()}
            >
              {!logout.isPending && <LogOut size={15} />}
              Desconectar
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-semibold">Disparo</p>
              <p className="mt-1 text-sm text-muted">
                {selected.size} produto(s) · {phoneCount(phones)} telefone(s)
              </p>
            </div>
            {sendResult && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                {sendResult.failed ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                {sendResult.sent} enviados · {sendResult.failed} falhas
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium text-muted">
              Telefones
              <textarea
                value={phones}
                onChange={(event) => setPhones(event.target.value)}
                rows={4}
                placeholder="Digite os telefones com DDD, um por linha"
                className="mt-1.5 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-all duration-200 ease-out-soft placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </label>
            <label className="text-sm font-medium text-muted">
              Mensagem inicial
              <Input value={intro} onChange={(event) => setIntro(event.target.value)} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!selected.size || !phones.trim()}
              loading={makePreview.isPending}
              onClick={() => makePreview.mutate()}
            >
              {!makePreview.isPending && <MessageCircle size={15} />}
              Prévia
            </Button>
            <Button
              size="sm"
              disabled={!connected || !selected.size || !phones.trim()}
              loading={send.isPending}
              onClick={() =>
                confirm('Enviar mensagem para os telefones informados?') && send.mutate()
              }
            >
              {!send.isPending && <Send size={15} />}
              Enviar WhatsApp
            </Button>
          </div>

          {(preview || makePreview.error || send.error) && (
            <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                Prévia
              </p>
              {makePreview.error || send.error ? (
                <p className="text-sm text-danger">
                  {(makePreview.error || send.error) instanceof Error
                    ? (makePreview.error || send.error)?.message
                    : 'Não foi possível preparar a mensagem.'}
                </p>
              ) : (
                <pre className="max-h-64 whitespace-pre-wrap break-words text-sm leading-6 text-fg">
                  {preview?.message}
                </pre>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold">Produtos</p>
            <p className="mt-1 text-sm text-muted">
              {products.data?.total ?? 0} itens disponíveis para mensagem
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Buscar produto"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!products.data?.items.length}
              onClick={toggleAllVisible}
            >
              {allVisibleSelected ? 'Limpar página' : 'Selecionar página'}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {products.isLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-3xl" />
            ))}
          {products.data?.items.map((product) => {
            const checked = selected.has(product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggleProduct(product.id)}
                className={cn(
                  'flex min-h-24 items-start gap-3 rounded-3xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/45',
                  checked
                    ? 'border-primary/35 bg-primary/[0.06]'
                    : 'border-border bg-surface hover:bg-surface-2',
                )}
              >
                <Checkbox
                  checked={checked}
                  onChange={() => toggleProduct(product.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Selecionar ${product.title}`}
                />
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border/60">
                  {product.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{product.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusPill status={product.status} />
                    <span className="nums text-xs font-medium text-muted">
                      {formatBRL(product.price)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-faint">{product.link}</p>
                </div>
              </button>
            );
          })}
        </div>

        {selectedProducts.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Selecionados nesta página: {selectedProducts.map((product) => product.sku).join(', ')}
          </p>
        )}
      </Card>
    </div>
  );
}

function phoneCount(value: string): number {
  return value
    .split(/[\s,;]+/)
    .map((phone) => phone.trim())
    .filter(Boolean).length;
}
