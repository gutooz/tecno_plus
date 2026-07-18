'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe,
  Link2,
  Link2Off,
  Package,
  ShoppingBag,
  Store,
  Unplug,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

interface IntegrationsData {
  channels: {
    channel: string;
    connected: boolean;
    implemented: boolean;
    paidAdsConfigured?: boolean;
  }[];
  shopee:
    | { connected: true; shopId: string; shopName: string; expiresAt: string }
    | { connected: false; configured: boolean };
}

const CHANNEL_META: Record<string, { label: string; icon: typeof Store; desc: string }> = {
  website: {
    label: 'Loja online',
    icon: Globe,
    desc: 'Vitrine própria — publicar aqui só marca o produto como visível no catálogo.',
  },
  shopee: {
    label: 'Shopee',
    icon: ShoppingBag,
    desc: 'Integração real via Shopee Open Platform API: OAuth, catálogo de produtos e pedidos.',
  },
  mercado_livre: { label: 'Mercado Livre', icon: Store, desc: 'Publisher em desenvolvimento.' },
  amazon: { label: 'Amazon', icon: Package, desc: 'Publisher em desenvolvimento.' },
  facebook: {
    label: 'Facebook',
    icon: Store,
    desc: 'Postagem automática com aprovação via Telegram.',
  },
  instagram: {
    label: 'Instagram',
    icon: Store,
    desc: 'Postagem automática com aprovação via Telegram.',
  },
};

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orders, setOrders] = useState<unknown[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<IntegrationsData>('/integrations'),
  });

  useEffect(() => {
    const shopee = searchParams.get('shopee');
    if (shopee === 'connected') {
      setBanner({ type: 'success', text: 'Loja Shopee conectada com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      router.replace('/integrations');
    } else if (shopee === 'error') {
      setBanner({
        type: 'error',
        text: searchParams.get('message') || 'Falha ao conectar a loja Shopee.',
      });
      router.replace('/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const connect = useMutation({
    mutationFn: () => api.get<{ url: string }>('/integrations/shopee/connect'),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) =>
      setBanner({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
  });

  const disconnect = useMutation({
    mutationFn: () => api.post('/integrations/shopee/disconnect'),
    onSuccess: () => {
      setOrders(null);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const test = useMutation({
    mutationFn: () =>
      api.get<{ ok: boolean; shop: { shop_name?: string } }>('/integrations/shopee/test'),
    onSuccess: (res) =>
      setBanner({
        type: 'success',
        text: `Conexão funcionando — loja "${res.shop?.shop_name ?? '—'}" respondeu à API.`,
      }),
    onError: (err) =>
      setBanner({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
  });

  const loadOrders = useMutation({
    mutationFn: () => api.get<{ orders: unknown[] }>('/integrations/shopee/orders'),
    onSuccess: (res) => setOrders(res.orders),
    onError: (err) =>
      setBanner({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
  });

  const shopee = data?.shopee;
  const shopeeConnected = shopee?.connected === true;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Integrações"
        subtitle="Conexões reais com marketplaces, ERPs e hubs logísticos"
      />

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

      {/* Shopee — única integração via API real hoje */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingBag size={20} />
            </span>
            <div>
              <p className="font-semibold">Shopee</p>
              <p className="mt-0.5 max-w-md text-sm text-muted">{CHANNEL_META.shopee.desc}</p>
              {isLoading ? (
                <p className="mt-2 text-xs text-muted">Carregando status…</p>
              ) : shopeeConnected ? (
                <p className="mt-2 text-xs text-success">
                  Conectada · loja &quot;{shopee.shopName || shopee.shopId}&quot; (ID{' '}
                  {shopee.shopId})
                </p>
              ) : shopee && !shopee.configured ? (
                <p className="mt-2 text-xs text-warning">
                  Servidor sem credenciais do app Shopee (SHOPEE_PARTNER_ID/KEY) — configure antes
                  de conectar.
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">Nenhuma loja conectada.</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {shopeeConnected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  loading={test.isPending}
                  onClick={() => test.mutate()}
                >
                  <Link2 size={15} /> Testar conexão
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={loadOrders.isPending}
                  onClick={() => loadOrders.mutate()}
                >
                  Ver pedidos recentes
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={disconnect.isPending}
                  onClick={() => disconnect.mutate()}
                >
                  <Unplug size={15} /> Desconectar
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={!shopee?.configured}
                loading={connect.isPending}
                onClick={() => connect.mutate()}
              >
                <Link2 size={15} /> Conectar loja Shopee
              </Button>
            )}
          </div>
        </div>

        {orders && (
          <div className="mt-4 border-t border-border/70 pt-4">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-faint">
              Pedidos recentes (15 dias)
            </p>
            {orders.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum pedido no período — a chamada à API funcionou.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {orders.map((o, i) => (
                  <li key={i} className="rounded-lg bg-surface-2/60 px-3 py-1.5 font-mono text-xs">
                    {JSON.stringify(o)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* Demais canais */}
      <div className="grid gap-3.5 sm:grid-cols-2">
        {(data?.channels ?? [])
          .filter((c) => c.channel !== 'shopee')
          .map((c) => {
            const meta = CHANNEL_META[c.channel] ?? { label: c.channel, icon: Store, desc: '' };
            const Icon = meta.icon;
            const manageable = c.channel === 'facebook' || c.channel === 'instagram';
            const cardContent = (
              <Card key={c.channel} interactive={manageable} className="flex items-start gap-3.5">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                    c.connected ? 'bg-success/12 text-success' : 'bg-muted/12 text-muted',
                  )}
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{meta.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{meta.desc}</p>
                  <p
                    className={cn(
                      'mt-1.5 inline-flex items-center gap-1 text-xs font-medium',
                      c.connected ? 'text-success' : 'text-muted',
                    )}
                  >
                    {c.connected ? (
                      <>
                        <CheckCircle2 size={12} /> Ativo
                      </>
                    ) : c.implemented ? (
                      <>
                        <Link2Off size={12} /> Não configurado
                      </>
                    ) : (
                      <>
                        <Clock3 size={12} /> Em desenvolvimento
                      </>
                    )}
                  </p>
                </div>
                {manageable && <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />}
              </Card>
            );
            return manageable ? (
              <Link key={c.channel} href={`/integrations/${c.channel}`}>
                {cardContent}
              </Link>
            ) : (
              cardContent
            );
          })}
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
        <ExternalLink size={13} />
        Swagger da API (produto/pedido/OAuth Shopee) disponível em{' '}
        <code className="rounded bg-surface-2 px-1 py-0.5">/api/docs</code>.
      </p>
    </div>
  );
}
