'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileCog,
  Globe2,
  KeyRound,
  Link2,
  RefreshCw,
  ShoppingBag,
  Store,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button, Card, StatusPill } from '@/components/ui';

type MarketplaceKey = 'shopee' | 'mercadoLivre';

interface ShopeeConfig {
  configured: boolean;
  environment: string;
  region: string;
  host: string;
  authHost: string;
  redirectUrl: string;
  webhookUrl: string;
  missing: string[];
}

interface MercadoLivreConfig {
  configured: boolean;
  authHost: string;
  apiHost: string;
  redirectUrl: string;
  missing: string[];
}

interface IntegrationsData {
  shopee:
    | {
        connected: true;
        shopId: string;
        shopName: string;
        expiresAt: string;
        status?: string;
        region?: string;
        lastSyncAt?: string | null;
        recentErrors?: string[];
        config: ShopeeConfig;
      }
    | ({ connected: false } & ShopeeConfig);
  mercadoLivre:
    | {
        connected: true;
        mlUserId: string;
        nickname: string;
        expiresAt: string;
        config: MercadoLivreConfig;
      }
    | ({ connected: false } & MercadoLivreConfig);
}

interface ShopeeOrderSummary {
  order_sn?: string;
  booking_sn?: string;
}

interface MarketplaceSettingsProps {
  marketplace: MarketplaceKey;
}

export function AdminMarketplaceSettings(props: MarketplaceSettingsProps) {
  return (
    <Suspense>
      <MarketplaceSettingsContent {...props} />
    </Suspense>
  );
}

function MarketplaceSettingsContent({ marketplace }: MarketplaceSettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orders, setOrders] = useState<ShopeeOrderSummary[] | null>(null);
  const adminPath = marketplace === 'shopee' ? '/admin/shopee' : '/admin/mercado-livre';

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<IntegrationsData>('/integrations'),
  });

  useEffect(() => {
    const shopee = searchParams.get('shopee');
    if (marketplace === 'shopee' && shopee === 'connected') {
      setBanner({ type: 'success', text: 'Loja Shopee conectada com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      router.replace(adminPath);
    } else if (marketplace === 'shopee' && shopee === 'error') {
      setBanner({
        type: 'error',
        text: searchParams.get('message') || 'Falha ao conectar a loja Shopee.',
      });
      router.replace(adminPath);
    }

    const ml = searchParams.get('ml');
    if (marketplace === 'mercadoLivre' && ml === 'connected') {
      setBanner({ type: 'success', text: 'Conta Mercado Livre conectada com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      router.replace(adminPath);
    } else if (marketplace === 'mercadoLivre' && ml === 'error') {
      setBanner({
        type: 'error',
        text: searchParams.get('message') || 'Falha ao conectar o Mercado Livre.',
      });
      router.replace(adminPath);
    }
  }, [adminPath, marketplace, queryClient, router, searchParams]);

  const connectShopee = useMutation({
    mutationFn: () =>
      api.get<{ url: string }>(
        `/integrations/shopee/connect?returnTo=${encodeURIComponent('/admin/shopee')}`,
      ),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const disconnectShopee = useMutation({
    mutationFn: () => api.post('/integrations/shopee/disconnect'),
    onSuccess: () => {
      setOrders(null);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const testShopee = useMutation({
    mutationFn: () =>
      api.get<{ ok: boolean; shop: { shop_name?: string } }>('/integrations/shopee/test'),
    onSuccess: (res) =>
      setBanner({
        type: 'success',
        text: `Conexao funcionando. Loja "${res.shop?.shop_name ?? 'Shopee'}" respondeu a API.`,
      }),
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const loadOrders = useMutation({
    mutationFn: () => api.get<{ orders: ShopeeOrderSummary[] }>('/integrations/shopee/orders'),
    onSuccess: (res) => setOrders(res.orders),
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const connectMl = useMutation({
    mutationFn: () =>
      api.get<{ url: string }>(
        `/integrations/mercado-livre/connect?returnTo=${encodeURIComponent(
          '/admin/mercado-livre',
        )}`,
      ),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const disconnectMl = useMutation({
    mutationFn: () => api.post('/integrations/mercado-livre/disconnect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const testMl = useMutation({
    mutationFn: () =>
      api.get<{ ok: boolean; account: { nickname?: string } }>('/integrations/mercado-livre/test'),
    onSuccess: (res) =>
      setBanner({
        type: 'success',
        text: `Conexao funcionando. Conta "${
          res.account?.nickname ?? 'Mercado Livre'
        }" respondeu a API.`,
      }),
    onError: (err) => setBanner(toErrorBanner(err)),
  });

  const page = useMemo(() => {
    if (marketplace === 'shopee') {
      const shopee = data?.shopee;
      const connected = shopee?.connected === true;
      const config = connected ? shopee.config : shopee;
      return {
        title: 'Shopee',
        subtitle: 'Catalogo, Excel em lote e API Open Platform',
        icon: ShoppingBag,
        connected,
        configured: Boolean(config?.configured),
        connectionName: connected ? shopee.shopName || shopee.shopId : 'Loja nao conectada',
        connectionId: connected ? shopee.shopId : null,
        expiresAt: connected ? shopee.expiresAt : null,
        status: connected
          ? shopee.status || 'active'
          : config?.configured
            ? 'pending'
            : 'pending_review',
        description:
          'Conecte a loja via Shopee Open Platform para consultar pedidos, renovar tokens e sincronizar produtos, preco e estoque.',
        missing: config?.missing ?? [],
        configRows: [
          { label: 'Ambiente', value: config?.environment || 'production' },
          { label: 'Regiao', value: config?.region || 'BR' },
          { label: 'API host', value: config?.host || 'Nao configurado' },
          { label: 'Auth host', value: config?.authHost || config?.host || 'Nao configurado' },
          { label: 'Callback', value: config?.redirectUrl || 'Nao configurado' },
          { label: 'Webhook', value: config?.webhookUrl || 'Nao configurado' },
        ],
      };
    }

    const mercadoLivre = data?.mercadoLivre;
    const connected = mercadoLivre?.connected === true;
    const config = connected ? mercadoLivre.config : mercadoLivre;
    return {
      title: 'Mercado Livre',
      subtitle: 'OAuth2, publicacao de anuncios e sincronizacao de conta',
      icon: Store,
      connected,
      configured: Boolean(config?.configured),
      connectionName: connected
        ? mercadoLivre.nickname || mercadoLivre.mlUserId
        : 'Conta nao conectada',
      connectionId: connected ? mercadoLivre.mlUserId : null,
      expiresAt: connected ? mercadoLivre.expiresAt : null,
      status: connected ? 'active' : config?.configured ? 'pending' : 'pending_review',
      description:
        'Conecte a conta do vendedor via API oficial do Mercado Livre para publicar anuncios e validar a conta.',
      missing: config?.missing ?? [],
      configRows: [
        { label: 'Auth host', value: config?.authHost || 'https://auth.mercadolivre.com.br' },
        { label: 'API host', value: config?.apiHost || 'https://api.mercadolibre.com' },
        { label: 'Redirect URI', value: config?.redirectUrl || 'Nao configurado' },
        { label: 'Callback backend', value: '/api/integrations/mercado-livre/callback' },
      ],
    };
  }, [data, marketplace]);

  const Icon = page.icon;
  const formattedExpiry = page.expiresAt
    ? new Date(page.expiresAt).toLocaleString('pt-BR')
    : 'Sem token ativo';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={page.title} subtitle={page.subtitle} />

      <AnimatePresence initial={false}>
        {banner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'mb-4 flex items-center gap-2 overflow-hidden rounded-xl px-3.5 py-2.5 text-sm',
              banner.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
            )}
          >
            {banner.type === 'success' ? (
              <CheckCircle2 size={15} className="shrink-0" />
            ) : (
              <AlertCircle size={15} className="shrink-0" />
            )}
            {banner.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon size={21} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{page.title}</p>
                  <StatusPill status={page.status} />
                </div>
                <p className="mt-1 max-w-xl text-sm text-muted">{page.description}</p>
                {isLoading ? (
                  <p className="mt-3 text-xs text-muted">Carregando status...</p>
                ) : page.connected ? (
                  <p className="mt-3 text-xs text-success">
                    Conectada: {page.connectionName}
                    {page.connectionId ? ` (ID ${page.connectionId})` : ''}
                  </p>
                ) : page.configured ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle2 size={14} /> Credenciais prontas para conectar.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-warning">
                    Configure as credenciais no servidor antes de conectar.
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {marketplace === 'shopee' ? (
                page.connected ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={testShopee.isPending}
                      onClick={() => testShopee.mutate()}
                    >
                      <Link2 size={15} /> Testar conexao
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={loadOrders.isPending}
                      onClick={() => loadOrders.mutate()}
                    >
                      <ClipboardCheck size={15} /> Pedidos recentes
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={disconnectShopee.isPending}
                      onClick={() => disconnectShopee.mutate()}
                    >
                      <Unplug size={15} /> Desconectar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={!page.configured}
                    loading={connectShopee.isPending}
                    onClick={() => connectShopee.mutate()}
                  >
                    <Link2 size={15} /> Conectar Shopee
                  </Button>
                )
              ) : page.connected ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={testMl.isPending}
                    onClick={() => testMl.mutate()}
                  >
                    <Link2 size={15} /> Testar conexao
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={disconnectMl.isPending}
                    onClick={() => disconnectMl.mutate()}
                  >
                    <Unplug size={15} /> Desconectar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={!page.configured}
                  loading={connectMl.isPending}
                  onClick={() => connectMl.mutate()}
                >
                  <Link2 size={15} /> Conectar Mercado Livre
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">
            Status tecnico
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatusRow
              icon={KeyRound}
              label="Credenciais"
              value={page.configured ? 'OK' : 'Pendentes'}
            />
            <StatusRow icon={RefreshCw} label="Token expira em" value={formattedExpiry} />
            <StatusRow icon={Globe2} label="Canal" value={page.title} />
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="flex items-center gap-2">
          <FileCog size={18} className="text-primary" />
          <p className="font-semibold">Configuracao necessaria</p>
        </div>

        <div className="mt-4 grid gap-3">
          {page.configRows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 rounded-2xl border border-border bg-surface-2/60 px-3.5 py-3 text-sm md:grid-cols-[160px_1fr]"
            >
              <span className="text-muted">{row.label}</span>
              <span className="break-all font-medium text-fg">{row.value}</span>
            </div>
          ))}
        </div>

        {page.missing.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
            Faltam variaveis no backend: {page.missing.join(', ')}.
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-success/25 bg-success/10 px-3.5 py-3 text-sm text-success">
            Todas as credenciais obrigatorias foram encontradas.
          </div>
        )}
      </Card>

      {marketplace === 'shopee' && orders && (
        <Card className="mb-4">
          <p className="font-semibold">Pedidos recentes da Shopee</p>
          {orders.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Nenhum pedido recente. A chamada a API funcionou.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border">
              {orders.map((order, index) => (
                <div
                  key={order.order_sn ?? index}
                  className="grid gap-2 border-b border-border px-3.5 py-3 text-sm last:border-b-0 sm:grid-cols-[120px_1fr_1fr]"
                >
                  <span className="font-medium text-fg">Pedido {index + 1}</span>
                  <span className="font-mono text-xs text-muted">
                    {order.order_sn ?? 'sem codigo'}
                  </span>
                  <span className="text-xs text-muted">
                    Booking: {order.booking_sn || 'nao informado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
        <ExternalLink size={13} />
        API tecnica em <code className="rounded bg-surface-2 px-1 py-0.5">/api/docs</code>.
      </p>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/60 px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-semibold text-fg">{value}</p>
      </div>
    </div>
  );
}

function toErrorBanner(err: unknown) {
  return {
    type: 'error' as const,
    text: err instanceof Error ? err.message : String(err),
  };
}
