'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ExternalLink, Link2, ShoppingBag, Unplug } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

interface IntegrationsData {
  shopee:
    | { connected: true; shopId: string; shopName: string; expiresAt: string }
    | { connected: false; configured: boolean };
}

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
  }, [queryClient, router, searchParams]);

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
        text: `Conexao funcionando. Loja "${res.shop?.shop_name ?? 'Shopee'}" respondeu a API.`,
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
      <PageHeader title="Shopee" subtitle="Conexao da loja, pedidos e publicacao em lote" />

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

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingBag size={20} />
            </span>
            <div>
              <p className="font-semibold">Shopee</p>
              <p className="mt-0.5 max-w-md text-sm text-muted">
                Integracao via Shopee Open Platform API para loja, catalogo e pedidos.
              </p>
              {isLoading ? (
                <p className="mt-2 text-xs text-muted">Carregando status...</p>
              ) : shopeeConnected ? (
                <p className="mt-2 text-xs text-success">
                  Conectada: {shopee.shopName || shopee.shopId} (ID {shopee.shopId})
                </p>
              ) : shopee && !shopee.configured ? (
                <p className="mt-2 text-xs text-warning">
                  Configure SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY no servidor antes de conectar.
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
                  <Link2 size={15} /> Testar conexao
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
              Pedidos recentes
            </p>
            {orders.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum pedido recente. A chamada a API funcionou.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {orders.map((order, index) => (
                  <li
                    key={index}
                    className="rounded-lg bg-surface-2/60 px-3 py-1.5 font-mono text-xs"
                  >
                    {JSON.stringify(order)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
        <ExternalLink size={13} />
        API Shopee disponivel em <code className="rounded bg-surface-2 px-1 py-0.5">/api/docs</code>
        .
      </p>
    </div>
  );
}
