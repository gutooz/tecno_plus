'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  ExternalLink,
  FileCog,
  Globe2,
  KeyRound,
  Link2,
  Pencil,
  PackageOpen,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  Unplug,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatBRL } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button, Card, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';

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

interface ShopeeStoreProduct {
  itemId: string;
  itemName: string;
  sku?: string;
  status: string;
  categoryId?: number;
  categoryName?: string;
  imageUrl?: string;
  price?: number;
  stock?: number;
  weight?: number;
  description?: string;
  createTime?: number;
  updateTime?: number;
}

interface ShopeeStoreProductsResponse {
  items: ShopeeStoreProduct[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNextPage: boolean;
  status: string;
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
    <div className="mx-auto max-w-7xl">
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

      {marketplace === 'shopee' && (
        <ShopeeStoreProducts
          connected={page.connected}
          onError={(err) => setBanner(toErrorBanner(err))}
        />
      )}

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

function ShopeeStoreProducts({
  connected,
  onError,
}: {
  connected: boolean;
  onError: (err: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('NORMAL');
  const [editing, setEditing] = useState<ShopeeStoreProduct | null>(null);
  const [deleting, setDeleting] = useState<ShopeeStoreProduct | null>(null);
  const [draft, setDraft] = useState({
    itemName: '',
    description: '',
    price: '',
    stock: '',
    weight: '',
  });

  const query = useQuery({
    queryKey: ['shopee-store-products', page, status, search],
    enabled: connected,
    queryFn: () =>
      api.get<ShopeeStoreProductsResponse>(
        `/integrations/shopee/products?${new URLSearchParams({
          page: String(page),
          limit: '20',
          status,
          search,
        }).toString()}`,
      ),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('Nenhum produto selecionado.');
      return api.patch<{ item?: ShopeeStoreProduct }>(
        `/integrations/shopee/products/${editing.itemId}`,
        {
          itemName: draft.itemName,
          description: draft.description,
          price: draft.price ? Number(draft.price) : undefined,
          stock: draft.stock ? Number(draft.stock) : undefined,
          weight: draft.weight ? Number(draft.weight) : undefined,
        },
      );
    },
    onSuccess: (res) => {
      setEditing(res.item ?? null);
      queryClient.invalidateQueries({ queryKey: ['shopee-store-products'] });
    },
    onError,
  });

  const listing = useMutation({
    mutationFn: ({ itemId, listed }: { itemId: string; listed: boolean }) =>
      api.post(`/integrations/shopee/products/${itemId}/listing`, { listed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopee-store-products'] }),
    onError,
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.del(`/integrations/shopee/products/${itemId}`),
    onSuccess: () => {
      setEditing(null);
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['shopee-store-products'] });
    },
    onError,
  });

  const items = query.data?.items ?? [];
  const isEmpty = connected && !query.isLoading && !items.length;

  function openEditor(item: ShopeeStoreProduct) {
    setEditing(item);
    setDraft({
      itemName: item.itemName,
      description: item.description ?? '',
      price: item.price != null ? String(item.price) : '',
      stock: item.stock != null ? String(item.stock) : '',
      weight: item.weight != null ? String(item.weight) : '',
    });
  }

  return (
    <>
      <Card className="mb-4 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Box size={18} className="text-primary" />
                <p className="font-semibold">Produtos cadastrados na Shopee</p>
              </div>
              <p className="mt-1 text-sm text-muted">
                Visualize e gerencie os anuncios que ja existem na loja conectada.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option value="NORMAL">Publicados</option>
                <option value="UNLIST">Ocultos</option>
                <option value="REVIEWING">Em revisao</option>
                <option value="BANNED">Bloqueados</option>
                <option value="SELLER_DELETE">Excluidos</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!connected}
                loading={query.isFetching}
                onClick={() => query.refetch()}
              >
                <RefreshCw size={15} /> Atualizar
              </Button>
            </div>
          </div>

          <div className="mt-4 max-w-md">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              disabled={!connected}
              leadingIcon={<Search size={16} />}
              placeholder="Pesquisar por titulo, SKU ou ID..."
            />
          </div>
        </div>

        {!connected ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
            <PackageOpen size={34} className="text-faint" />
            <p className="mt-3 font-semibold">Conecte a Shopee para ver o catalogo da loja</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Assim que a autorizacao estiver ativa, os produtos cadastrados aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="md:hidden">
              {query.isLoading &&
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="border-b border-border px-4 py-3">
                    <Skeleton className="h-24 rounded-2xl" />
                  </div>
                ))}
              {items.map((item) => (
                <div key={item.itemId} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex gap-3">
                    <ProductThumb item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.itemName}</p>
                          <p className="truncate text-xs text-muted">
                            SKU {item.sku || 'sem SKU'} · ID {item.itemId}
                          </p>
                        </div>
                        <StatusPill status={storeStatus(item.status)} />
                      </div>
                      <div className="nums mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>{formatBRL(item.price)}</span>
                        <span>Estoque {item.stock ?? '-'}</span>
                        <span>{item.categoryName || categoryLabel(item)}</span>
                      </div>
                      <ProductActions
                        item={item}
                        listingPending={listing.isPending}
                        deletePending={remove.isPending}
                        onEdit={openEditor}
                        onListing={(listed) => listing.mutate({ itemId: item.itemId, listed })}
                        onDelete={() => setDeleting(item)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {isEmpty && <ShopeeProductsEmpty />}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="px-4 py-3 font-semibold">Produto</th>
                    <th className="px-3 py-3 font-semibold">Categoria</th>
                    <th className="px-3 py-3 font-semibold">Preco</th>
                    <th className="px-3 py-3 font-semibold">Estoque</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Atualizado</th>
                    <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {query.isLoading &&
                    Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index} className="border-b border-border/60">
                        <td colSpan={7} className="px-4 py-3">
                          <Skeleton className="h-12 w-full rounded-xl" />
                        </td>
                      </tr>
                    ))}
                  {items.map((item) => (
                    <tr
                      key={item.itemId}
                      className="border-b border-border/60 transition-colors hover:bg-surface-2/45"
                    >
                      <td className="px-4 py-3">
                        <div className="flex min-w-[260px] items-center gap-3">
                          <ProductThumb item={item} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.itemName}</p>
                            <p className="truncate text-xs text-muted">
                              SKU {item.sku || 'sem SKU'} · ID {item.itemId}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {item.categoryName || categoryLabel(item)}
                      </td>
                      <td className="nums px-3 py-3 font-medium">{formatBRL(item.price)}</td>
                      <td className="nums px-3 py-3 text-muted">{item.stock ?? '-'}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={storeStatus(item.status)} />
                      </td>
                      <td className="nums px-3 py-3 text-muted">
                        {formatUnixDate(item.updateTime)}
                      </td>
                      <td className="px-4 py-3">
                        <ProductActions
                          item={item}
                          listingPending={listing.isPending}
                          deletePending={remove.isPending}
                          onEdit={openEditor}
                          onListing={(listed) => listing.mutate({ itemId: item.itemId, listed })}
                          onDelete={() => setDeleting(item)}
                          align="end"
                        />
                      </td>
                    </tr>
                  ))}
                  {isEmpty && (
                    <tr>
                      <td colSpan={7}>
                        <ShopeeProductsEmpty />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {connected && query.data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted">
            <span>
              {query.data.total} produto(s) · pagina {query.data.page} de {query.data.pages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!query.data.hasNextPage || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Proxima
              </Button>
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold">Editar produto Shopee</p>
                <p className="truncate text-sm text-muted">ID {editing.itemId}</p>
              </div>
              <IconButton aria-label="Fechar" onClick={() => setEditing(null)}>
                <X size={18} />
              </IconButton>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-[88px_1fr]">
                <ProductThumb item={editing} large />
                <div className="grid gap-3">
                  <Input
                    value={draft.itemName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, itemName: event.target.value }))
                    }
                    placeholder="Titulo"
                  />
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={5}
                    className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                    placeholder="Descricao"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Input
                  value={draft.price}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, price: event.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="Preco"
                />
                <Input
                  value={draft.stock}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, stock: event.target.value }))
                  }
                  inputMode="numeric"
                  placeholder="Estoque"
                />
                <Input
                  value={draft.weight}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, weight: event.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="Peso kg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
              <Button variant="danger" size="sm" onClick={() => setDeleting(editing)}>
                <Trash2 size={15} /> Excluir
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
                  <Save size={15} /> Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/12 text-danger">
                <Trash2 size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">Excluir produto da Shopee?</p>
                <p className="mt-1 text-sm text-muted">
                  {deleting.itemName} sera removido da loja conectada.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDeleting(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={remove.isPending}
                onClick={() => remove.mutate(deleting.itemId)}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProductThumb({ item, large = false }: { item: ShopeeStoreProduct; large?: boolean }) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60',
        large ? 'h-20 w-20' : 'h-12 w-12',
      )}
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-faint">
          <PackageOpen size={large ? 28 : 18} />
        </div>
      )}
    </div>
  );
}

function ProductActions({
  item,
  listingPending,
  deletePending,
  onEdit,
  onListing,
  onDelete,
  align = 'start',
}: {
  item: ShopeeStoreProduct;
  listingPending: boolean;
  deletePending: boolean;
  onEdit: (item: ShopeeStoreProduct) => void;
  onListing: (listed: boolean) => void;
  onDelete: () => void;
  align?: 'start' | 'end';
}) {
  const isListed = item.status === 'NORMAL';
  return (
    <div className={cn('mt-2 flex items-center gap-0.5', align === 'end' && 'justify-end')}>
      <IconButton size="sm" aria-label="Visualizar e editar" onClick={() => onEdit(item)}>
        {isListed ? <Pencil size={15} /> : <Eye size={15} />}
      </IconButton>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2.5 text-xs"
        disabled={listingPending}
        onClick={() => onListing(!isListed)}
      >
        {isListed ? 'Ocultar' : 'Publicar'}
      </Button>
      <IconButton
        size="sm"
        tone="danger"
        disabled={deletePending}
        aria-label="Excluir"
        onClick={onDelete}
      >
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

function ShopeeProductsEmpty() {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
      <PackageOpen size={32} className="text-faint" />
      <p className="mt-3 font-semibold">Nenhum produto encontrado</p>
      <p className="mt-1 max-w-md text-sm text-muted">
        Troque o filtro de status ou atualize para consultar a loja novamente.
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

function storeStatus(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'NORMAL') return 'published';
  if (normalized === 'UNLIST') return 'hidden';
  if (normalized === 'REVIEWING') return 'pending_review';
  if (normalized === 'BANNED') return 'failed';
  if (normalized.includes('DELETE')) return 'archived';
  return status.toLowerCase();
}

function categoryLabel(item: ShopeeStoreProduct) {
  return item.categoryId ? `Categoria ${item.categoryId}` : '-';
}

function formatUnixDate(value?: number) {
  if (!value) return '-';
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function toErrorBanner(err: unknown) {
  return {
    type: 'error' as const,
    text: err instanceof Error ? err.message : String(err),
  };
}
