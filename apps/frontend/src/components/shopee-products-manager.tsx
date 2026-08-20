'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatBRL } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button, Card, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';

interface ShopeeConfig {
  configured: boolean;
}

interface IntegrationsData {
  shopee:
    | {
        connected: true;
        shopId: string;
        shopName: string;
        status?: string;
        config: ShopeeConfig;
      }
    | ({ connected: false } & ShopeeConfig);
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

interface ProductRow {
  _id: string;
  internalSku: string;
  status: string;
  vision: { name?: string; brand?: string; category?: string; quantity?: number };
  content?: { title?: string; category?: string };
  pricing?: { suggestedPrice?: number };
  images?: { thumbnail?: string; original?: string };
  publishedChannels?: string[];
  externalIds?: Record<string, string>;
}

interface LocalProductsResponse {
  items: ProductRow[];
  total: number;
  page: number;
  pages: number;
}

interface PublishResult {
  success?: boolean;
  externalId?: string;
}

export function ShopeeProductsManager() {
  return (
    <Suspense>
      <ShopeeProductsContent />
    </Suspense>
  );
}

function ShopeeProductsContent() {
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
      setBanner({ type: 'success', text: 'Loja Shopee conectada com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      router.replace('/admin/shopee');
    } else if (shopee === 'error') {
      setBanner({
        type: 'error',
        text: searchParams.get('message') || 'Falha ao conectar a loja Shopee.',
      });
      router.replace('/admin/shopee');
    }
  }, [queryClient, router, searchParams]);

  const shopee = data?.shopee;
  const connected = shopee?.connected === true;
  const shopName = shopee?.connected ? shopee.shopName || shopee.shopId : '';
  const configured = shopee?.connected ? shopee.config.configured : Boolean(shopee?.configured);

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

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Shopee"
        subtitle={
          connected
            ? `Produtos da loja ${shopName}`
            : 'Produtos da loja conectada pela Shopee Open Platform'
        }
      />

      {banner && (
        <div
          className={cn(
            'mb-4 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm',
            banner.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 size={15} className="shrink-0" />
            ) : (
              <AlertCircle size={15} className="shrink-0" />
            )}
            <span className="min-w-0">{banner.text}</span>
          </span>
          <IconButton size="sm" aria-label="Fechar mensagem" onClick={() => setBanner(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}

      {!isLoading && !connected ? (
        <Card className="flex min-h-72 flex-col items-center justify-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingBag size={26} />
          </span>
          <p className="mt-4 font-semibold">Conecte sua loja Shopee</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Depois de conectar, seus produtos reais aparecem aqui para cadastrar, editar, ocultar e
            excluir direto na Shopee.
          </p>
          <Button
            className="mt-5"
            disabled={!configured}
            loading={connectShopee.isPending}
            onClick={() => connectShopee.mutate()}
          >
            Conectar Shopee
          </Button>
          {!configured && (
            <p className="mt-3 max-w-md text-xs text-muted">
              A conexão da Shopee ainda precisa ser ativada no servidor.
            </p>
          )}
        </Card>
      ) : (
        <ShopeeStoreProducts
          connected={connected}
          onError={(err) => setBanner(toErrorBanner(err))}
        />
      )}
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
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
      setNotice('Produto atualizado na Shopee.');
      queryClient.invalidateQueries({ queryKey: ['shopee-store-products'] });
    },
    onError,
  });

  const listing = useMutation({
    mutationFn: ({ itemId, listed }: { itemId: string; listed: boolean }) =>
      api.post(`/integrations/shopee/products/${itemId}/listing`, { listed }),
    onSuccess: () => {
      setNotice('Status atualizado na Shopee.');
      queryClient.invalidateQueries({ queryKey: ['shopee-store-products'] });
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.del(`/integrations/shopee/products/${itemId}`),
    onSuccess: () => {
      setEditing(null);
      setDeleting(null);
      setNotice('Produto excluído da Shopee.');
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
      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-muted">
          <span className="flex min-w-0 items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0 text-primary" />
            <span className="min-w-0">{notice}</span>
          </span>
          <IconButton size="sm" aria-label="Fechar mensagem" onClick={() => setNotice(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Box size={18} className="shrink-0 text-primary" />
                <p className="font-semibold">Produtos cadastrados na Shopee</p>
              </div>
              <p className="mt-1 text-sm text-muted">
                Cadastre pelo Catálogo IA e gerencie os anúncios que já existem na loja.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
              <Button size="sm" disabled={!connected} onClick={() => setCreating(true)}>
                <Plus size={15} /> Adicionar produto
              </Button>
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

          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_14rem]">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              disabled={!connected}
              leadingIcon={<Search size={16} />}
              placeholder="Pesquisar por título, SKU ou ID"
            />
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option value="NORMAL">Publicados</option>
              <option value="UNLIST">Ocultos</option>
              <option value="REVIEWING">Em revisão</option>
              <option value="BANNED">Bloqueados</option>
              <option value="SELLER_DELETE">Excluídos</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-border/70">
          {query.isLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="px-4 py-3 sm:px-5">
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ))}

          {items.map((item) => (
            <ShopeeProductRow
              key={item.itemId}
              item={item}
              listingPending={listing.isPending}
              deletePending={remove.isPending}
              onEdit={openEditor}
              onListing={(listed) => listing.mutate({ itemId: item.itemId, listed })}
              onDelete={() => setDeleting(item)}
            />
          ))}

          {isEmpty && <ShopeeProductsEmpty />}
        </div>

        {connected && query.data && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span>
              {query.data.total} produto(s) · página {query.data.page} de {query.data.pages}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
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
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>

      {creating && (
        <CreateShopeeProductDialog
          onClose={() => setCreating(false)}
          onPublished={(itemId) => {
            setCreating(false);
            setNotice(
              itemId
                ? `Produto publicado na Shopee. Item ID ${itemId}.`
                : 'Produto publicado na Shopee.',
            );
            queryClient.invalidateQueries({ queryKey: ['shopee-store-products'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }}
          onError={onError}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold">Editar produto Shopee</p>
                <p className="truncate text-sm text-muted">ID {editing.itemId}</p>
              </div>
              <IconButton aria-label="Fechar" onClick={() => setEditing(null)}>
                <X size={18} />
              </IconButton>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-[88px_1fr]">
                <ProductThumb item={editing} large />
                <div className="grid gap-3">
                  <Input
                    value={draft.itemName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, itemName: event.target.value }))
                    }
                    placeholder="Título"
                  />
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={5}
                    className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                    placeholder="Descrição"
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
                  placeholder="Preço"
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

            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="danger" size="sm" onClick={() => setDeleting(editing)}>
                <Trash2 size={15} /> Excluir
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                  {deleting.itemName} será removido da loja conectada.
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

function ShopeeProductRow({
  item,
  listingPending,
  deletePending,
  onEdit,
  onListing,
  onDelete,
}: {
  item: ShopeeStoreProduct;
  listingPending: boolean;
  deletePending: boolean;
  onEdit: (item: ShopeeStoreProduct) => void;
  onListing: (listed: boolean) => void;
  onDelete: () => void;
}) {
  const isListed = item.status === 'NORMAL';
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.8fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_auto] lg:items-center">
        <div className="flex min-w-0 gap-3">
          <ProductThumb item={item} />
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium">{item.itemName}</p>
            <p className="mt-0.5 break-words text-xs text-muted">
              SKU {item.sku || 'sem SKU'} · ID {item.itemId}
            </p>
            <p className="mt-1 line-clamp-1 text-xs text-muted">
              {item.categoryName || categoryLabel(item)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-1">
          <InfoChip label="Preço" value={formatBRL(item.price)} />
          <InfoChip label="Estoque" value={String(item.stock ?? '-')} />
          <InfoChip label="Peso" value={item.weight ? `${item.weight} kg` : '-'} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={storeStatus(item.status)} />
          <span className="nums text-xs text-muted">{formatUnixDate(item.updateTime)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <IconButton size="sm" aria-label="Editar produto" onClick={() => onEdit(item)}>
            <Pencil size={15} />
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
            aria-label="Excluir produto"
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function CreateShopeeProductDialog({
  onClose,
  onPublished,
  onError,
}: {
  onClose: () => void;
  onPublished: (itemId?: string) => void;
  onError: (err: unknown) => void;
}) {
  const [search, setSearch] = useState('');
  const products = useQuery({
    queryKey: ['products-for-shopee-create', search],
    queryFn: () =>
      api.get<LocalProductsResponse>(
        `/products?search=${encodeURIComponent(search)}&page=1&limit=20`,
      ),
  });

  const publish = useMutation({
    mutationFn: (productId: string) =>
      api.post<PublishResult>(`/products/${productId}/publish?channel=shopee`),
    onSuccess: (res) => onPublished(res.externalId),
    onError,
  });

  const items = products.data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-semibold">Adicionar produto na Shopee</p>
            <p className="mt-1 text-sm text-muted">
              Escolha um produto do Catálogo IA para publicar na loja real.
            </p>
          </div>
          <IconButton aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="border-b border-border px-5 py-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search size={16} />}
            placeholder="Pesquisar no Catálogo IA"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {products.isLoading &&
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="border-b border-border px-5 py-3">
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ))}

          {!products.isLoading &&
            items.map((product) => {
              const alreadyPublished =
                Boolean(product.externalIds?.shopee) ||
                product.publishedChannels?.includes('shopee');
              return (
                <div
                  key={product._id}
                  className="flex flex-col gap-3 border-b border-border px-5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <LocalProductThumb product={product} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium">{productTitle(product)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        SKU {product.internalSku} ·{' '}
                        {product.content?.category || product.vision.category || '-'}
                      </p>
                      <p className="nums mt-1 text-sm font-medium">
                        {formatBRL(product.pricing?.suggestedPrice)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={alreadyPublished ? 'outline' : 'primary'}
                    disabled={alreadyPublished}
                    loading={publish.isPending}
                    onClick={() => publish.mutate(product._id)}
                  >
                    <UploadCloud size={15} />
                    {alreadyPublished ? 'Já na Shopee' : 'Subir'}
                  </Button>
                </div>
              );
            })}

          {!products.isLoading && !items.length && (
            <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
              <PackageOpen size={32} className="text-faint" />
              <p className="mt-3 font-semibold">Nenhum produto encontrado</p>
              <p className="mt-1 max-w-md text-sm text-muted">
                Cadastre produtos em Produtos IA para publicar na Shopee.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductThumb({ item, large = false }: { item: ShopeeStoreProduct; large?: boolean }) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60',
        large ? 'h-20 w-20' : 'h-14 w-14',
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

function LocalProductThumb({ product }: { product: ProductRow }) {
  const image = product.images?.thumbnail || product.images?.original;
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <PackageOpen size={18} className="text-faint" />
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="nums mt-0.5 font-medium">{value}</p>
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

function productTitle(product: ProductRow) {
  return product.content?.title || product.vision.name || product.internalSku;
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
