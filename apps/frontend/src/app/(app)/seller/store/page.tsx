'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  RefreshCw,
  ShoppingBag,
  Store,
  Unplug,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

interface ShopeeConfig {
  configured: boolean;
  environment: string;
  region: string;
  host: string;
  redirectUrl: string;
  webhookUrl: string;
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
}

export default function SellerStorePage() {
  return (
    <Suspense>
      <SellerStoreContent />
    </Suspense>
  );
}

function SellerStoreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<IntegrationsData>('/integrations'),
  });

  useEffect(() => {
    const shopee = searchParams.get('shopee');
    if (shopee === 'connected') {
      setBanner({ type: 'success', text: 'Loja Shopee cadastrada com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      router.replace('/seller/store');
    } else if (shopee === 'error') {
      setBanner({
        type: 'error',
        text: searchParams.get('message') || 'Falha ao cadastrar a loja Shopee.',
      });
      router.replace('/seller/store');
    }
  }, [queryClient, router, searchParams]);

  const connect = useMutation({
    mutationFn: () =>
      api.get<{ url: string }>('/integrations/shopee/connect?returnTo=/seller/store'),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) =>
      setBanner({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
  });

  const disconnect = useMutation({
    mutationFn: () => api.post('/integrations/shopee/disconnect'),
    onSuccess: () => {
      setBanner({ type: 'success', text: 'Loja Shopee removida desta conta.' });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (err) =>
      setBanner({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
  });

  const test = useMutation({
    mutationFn: () =>
      api.get<{ ok: boolean; shop: { shop_name?: string } }>('/integrations/shopee/test'),
    onSuccess: (res) =>
      setBanner({
        type: 'success',
        text: `Conexao funcionando: ${res.shop?.shop_name ?? 'Shopee'} respondeu a API.`,
      }),
    onError: (err) =>
      setBanner({ type: 'error', text: err instanceof Error ? err.message : String(err) }),
  });

  const shopee = data?.shopee;
  const connected = shopee?.connected === true;
  const config = connected ? shopee.config : shopee;
  const configured = Boolean(config?.configured);
  const expiresAt =
    connected && shopee.expiresAt ? new Date(shopee.expiresAt).toLocaleDateString('pt-BR') : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Minha loja Shopee" subtitle="Cadastro e conexao da conta vendedora" />

      {banner && (
        <div
          className={cn(
            'mb-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm',
            banner.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 size={15} className="shrink-0" />
          ) : (
            <AlertCircle size={15} className="shrink-0" />
          )}
          {banner.text}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingBag size={20} />
            </span>
            <div>
              <p className="font-semibold">Cadastro da Shopee</p>
              <p className="mt-0.5 max-w-lg text-sm text-muted">
                Conecte a loja do vendedor pela Shopee Open Platform para publicar produtos,
                consultar pedidos e sincronizar estoque.
              </p>
              {isLoading ? (
                <Skeleton className="mt-3 h-5 w-48" />
              ) : connected ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 size={14} />
                  {shopee.shopName || 'Loja Shopee'} cadastrada (ID {shopee.shopId})
                </p>
              ) : configured ? (
                <p className="mt-2 text-xs text-muted">
                  A conta ainda nao tem uma loja Shopee cadastrada.
                </p>
              ) : (
                <p className="mt-2 text-xs text-warning">
                  A integracao Shopee precisa ser configurada no servidor antes do cadastro.
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {connected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  loading={test.isPending}
                  onClick={() => test.mutate()}
                >
                  <RefreshCw size={15} /> Testar
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
                disabled={!configured}
                loading={connect.isPending}
                onClick={() => connect.mutate()}
              >
                <Link2 size={15} /> Cadastrar minha Shopee
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3">
          <Info
            label="Status"
            value={connected ? shopee.status || 'connected' : 'Nao cadastrada'}
          />
          <Info label="Regiao" value={config?.region || 'BR'} />
          <Info label="Token expira" value={expiresAt || 'Apos cadastro'} />
        </div>

        {!configured && config?.missing?.length ? (
          <p className="mt-4 text-xs text-warning">
            Variaveis faltando: {config.missing.join(', ')}.
          </p>
        ) : null}
      </Card>

      <Card className="mt-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success">
            <Store size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">Depois de cadastrar</p>
            <p className="mt-1 text-sm text-muted">
              Os produtos importados do catalogo podem ser preparados para anuncio e enviados para a
              loja cadastrada.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
