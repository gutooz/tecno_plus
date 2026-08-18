'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Edit3,
  ImageIcon,
  PackageOpen,
  Save,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatBRL } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button, Card, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';

interface SupplierSummary {
  id: string;
  name: string;
  logoUrl?: string;
}

interface SourceProduct {
  id: string;
  name: string;
  supplierSku: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  brand?: string;
  images?: string[];
  stock?: number;
  costPrice?: number;
  suggestedPrice?: number;
  variations?: Record<string, unknown>[];
  weight?: number;
  dimensions?: { length?: number; width?: number; height?: number };
}

export interface SellerListing {
  _id: string;
  marketplace: string;
  status: string;
  externalItemId?: string;
  listingData: {
    title?: string;
    description?: string;
    categoryId?: string;
    images?: string[];
    sellerSku?: string;
    stockToPublish?: number;
    warning?: string;
  };
  pricing: { costPrice?: number; finalPrice?: number; profit?: number; profitPercent?: number };
  variants?: Record<string, unknown>[];
  supplier?: SupplierSummary | null;
  product?: SourceProduct | null;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface EditForm {
  title: string;
  description: string;
  categoryId: string;
  sellerSku: string;
  stockToPublish: number;
  finalPrice: number;
  profitPercent: number;
}

const PLATFORM_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'mercado_livre', label: 'Mercado Livre' },
  { id: 'tiktok_shop', label: 'TikTok Shop' },
  { id: 'other', label: 'Outras' },
];

export function SellerPlatformProducts({
  title,
  subtitle,
  marketplace,
}: {
  title: string;
  subtitle: string;
  marketplace?: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selected, setSelected] = useState<SellerListing | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const queryKey = ['seller-listings', marketplace ?? 'all'];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<SellerListing[]>(
        `/dropshipping/seller/listings${marketplace ? `?marketplace=${marketplace}` : ''}`,
      ),
    refetchInterval: 10000,
  });

  const listings = useMemo(() => data ?? [], [data]);
  const visibleListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listings.filter((listing) => {
      const platformMatches =
        marketplace ||
        platformFilter === 'all' ||
        platformKey(listing.marketplace) === platformFilter ||
        (platformFilter === 'other' && !knownPlatform(listing.marketplace));
      if (!platformMatches) return false;
      if (!term) return true;
      const haystack = [
        listing.listingData.title,
        listing.listingData.description,
        listing.product?.name,
        listing.product?.brand,
        listing.product?.category,
        listing.supplier?.name,
        listing.marketplace,
        listing.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [listings, marketplace, platformFilter, search]);

  const stats = useMemo(() => {
    const published = listings.filter((listing) =>
      ['published', 'published_with_warning'].includes(listing.status),
    ).length;
    const drafts = listings.filter((listing) =>
      ['draft', 'rejected', 'sync_error'].includes(listing.status),
    ).length;
    const inventory = listings.reduce(
      (sum, listing) => sum + Number(listing.listingData.stockToPublish ?? 0),
      0,
    );
    const value = listings.reduce(
      (sum, listing) => sum + Number(listing.pricing.finalPrice ?? 0),
      0,
    );
    return { total: listings.length, published, drafts, inventory, value };
  }, [listings]);

  const publish = useMutation({
    mutationFn: (id: string) =>
      api.post<{ externalItemId?: string }>(
        `/dropshipping/seller/listings/${id}/request-publication`,
      ),
    onSuccess: (res) => {
      setMessage(res.externalItemId ? `Publicado. Item ID ${res.externalItemId}.` : 'Publicado.');
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : String(err)),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EditForm> }) =>
      api.patch<SellerListing>(`/dropshipping/seller/listings/${id}`, body),
    onSuccess: (updated) => {
      setSelected(updated);
      setMessage('Produto atualizado.');
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : String(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/dropshipping/seller/listings/${id}`),
    onSuccess: () => {
      setSelected(null);
      setMessage('Produto excluído.');
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : String(err)),
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={title} subtitle={subtitle}>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Pesquisar produto"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </PageHeader>

      {message && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-muted">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-primary" />
            {message}
          </span>
          <IconButton aria-label="Fechar mensagem" size="sm" onClick={() => setMessage(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Produtos" value={stats.total} loading={isLoading} />
        <Metric label="Publicados" value={stats.published} loading={isLoading} />
        <Metric label="Rascunhos" value={stats.drafts} loading={isLoading} />
        <Metric label="Estoque" value={stats.inventory} loading={isLoading} />
        <Metric label="Valor final" value={formatBRL(stats.value)} loading={isLoading} />
      </div>

      {!marketplace && (
        <div className="mb-4 flex flex-wrap gap-2">
          {PLATFORM_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setPlatformFilter(filter.id)}
              aria-pressed={platformFilter === filter.id}
              className={cn(
                'rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
                platformFilter === filter.id
                  ? 'border-primary/45 bg-primary/10 text-primary'
                  : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3">Produto</th>
                <th className="px-3 py-3">Plataforma</th>
                <th className="px-3 py-3">Fornecedor</th>
                <th className="px-3 py-3">Preço</th>
                <th className="px-3 py-3">Estoque</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-12 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading &&
                visibleListings.map((listing) => (
                  <tr
                    key={listing._id}
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelected(listing)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelected(listing);
                    }}
                    className="border-b border-border/60 transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45"
                  >
                    <td className="min-w-80 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb listing={listing} />
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-medium">{listing.listingData.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                            {listing.product?.category || listing.listingData.sellerSku || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">{platformLabel(listing.marketplace)}</td>
                    <td className="px-3 py-3 text-muted">{listing.supplier?.name ?? '-'}</td>
                    <td className="nums px-3 py-3">{formatBRL(listing.pricing.finalPrice ?? 0)}</td>
                    <td className="nums px-3 py-3">{listing.listingData.stockToPublish ?? 0}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={listing.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          aria-label="Editar produto"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(listing);
                          }}
                        >
                          <Edit3 size={15} />
                        </IconButton>
                        <IconButton
                          aria-label="Publicar produto"
                          disabled={!canPublish(listing)}
                          onClick={(event) => {
                            event.stopPropagation();
                            publish.mutate(listing._id);
                          }}
                        >
                          <Send size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && !visibleListings.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
                      <ShoppingBag size={28} />
                      <p className="text-sm">
                        Importe produtos do Shopping para preparar os anúncios.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <ListingDialog
          listing={selected}
          saving={update.isPending}
          deleting={remove.isPending}
          publishing={publish.isPending}
          onClose={() => setSelected(null)}
          onSave={(body) => update.mutate({ id: selected._id, body })}
          onDelete={() => remove.mutate(selected._id)}
          onPublish={() => publish.mutate(selected._id)}
        />
      )}
    </div>
  );
}

function ListingDialog({
  listing,
  saving,
  deleting,
  publishing,
  onClose,
  onSave,
  onDelete,
  onPublish,
}: {
  listing: SellerListing;
  saving: boolean;
  deleting: boolean;
  publishing: boolean;
  onClose: () => void;
  onSave: (body: Partial<EditForm>) => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState<EditForm>(() => formFromListing(listing));
  const images = listing.listingData.images?.length
    ? listing.listingData.images
    : (listing.product?.images ?? []);

  useEffect(() => {
    setForm(formFromListing(listing));
  }, [listing]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateField = <Key extends keyof EditForm>(key: Key, value: EditForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-dialog-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {platformLabel(listing.marketplace)}
            </p>
            <h2 id="listing-dialog-title" className="mt-1 line-clamp-2 text-xl font-semibold">
              {listing.listingData.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {listing.supplier?.name ?? 'Fornecedor'} · {listing.product?.supplierSku ?? '-'}
            </p>
          </div>
          <IconButton ref={closeRef} aria-label="Fechar modal" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[0.95fr_1.05fr]">
          <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: Math.max(4, images.length || 1) }).map((_, index) => {
                const image = images[index];
                return (
                  <div
                    key={`${listing._id}-dialog-image-${index}`}
                    className="aspect-square overflow-hidden rounded-2xl border border-border bg-surface-2"
                  >
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-faint">
                        <ImageIcon size={24} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Info label="Custo" value={formatBRL(listing.pricing.costPrice ?? 0)} />
              <Info label="Preço" value={formatBRL(listing.pricing.finalPrice ?? 0)} />
              <Info label="Margem" value={`${(listing.pricing.profitPercent ?? 0).toFixed(1)}%`} />
              <Info label="Estoque origem" value={String(listing.product?.stock ?? '-')} />
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface-2/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Descrição do fornecedor
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                {listing.product?.description ||
                  listing.product?.shortDescription ||
                  'Sem descrição do fornecedor.'}
              </p>
            </div>
          </div>

          <form
            className="space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(form);
            }}
          >
            <Field label="Título">
              <Input
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
              />
            </Field>

            <Field label="Descrição do anúncio">
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={7}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="SKU vendedor">
                <Input
                  value={form.sellerSku}
                  onChange={(event) => updateField('sellerSku', event.target.value)}
                />
              </Field>
              <Field label="Categoria marketplace">
                <Input
                  value={form.categoryId}
                  onChange={(event) => updateField('categoryId', event.target.value)}
                />
              </Field>
              <Field label="Estoque para publicar">
                <Input
                  className="nums"
                  type="number"
                  min={0}
                  value={form.stockToPublish}
                  onChange={(event) => updateField('stockToPublish', Number(event.target.value))}
                />
              </Field>
              <Field label="Preço final">
                <Input
                  className="nums"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.finalPrice}
                  onChange={(event) => updateField('finalPrice', Number(event.target.value))}
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-border bg-surface-2/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Status do anúncio</span>
                <StatusPill status={listing.status} />
              </div>
              {listing.lastError && <p className="mt-2 text-sm text-danger">{listing.lastError}</p>}
              {listing.externalItemId && (
                <p className="mt-2 text-sm text-muted">Item externo: {listing.externalItemId}</p>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="text-danger hover:border-danger/40 hover:bg-danger/10"
                loading={deleting}
                onClick={() => {
                  if (window.confirm('Excluir este produto da plataforma?')) onDelete();
                }}
              >
                <Trash2 size={15} />
                Excluir
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canPublish(listing)}
                  loading={publishing}
                  onClick={onPublish}
                >
                  <Send size={15} />
                  Publicar
                </Button>
                <Button loading={saving}>
                  <Save size={15} />
                  Salvar alterações
                </Button>
              </div>
            </footer>
          </form>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <Card className="flex min-h-28 flex-col justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-faint">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p className="nums text-2xl font-semibold">{value}</p>
      )}
    </Card>
  );
}

function ProductThumb({ listing }: { listing: SellerListing }) {
  const image = listing.listingData.images?.[0] ?? listing.product?.images?.[0];
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-2">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <PackageOpen size={18} className="text-faint" />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="nums mt-1 font-medium">{value}</p>
    </div>
  );
}

function formFromListing(listing: SellerListing): EditForm {
  return {
    title: listing.listingData.title ?? '',
    description: listing.listingData.description ?? '',
    categoryId: listing.listingData.categoryId ?? '',
    sellerSku: listing.listingData.sellerSku ?? '',
    stockToPublish: Number(listing.listingData.stockToPublish ?? 0),
    finalPrice: Number(listing.pricing.finalPrice ?? 0),
    profitPercent: Number(listing.pricing.profitPercent ?? 0),
  };
}

function canPublish(listing: SellerListing) {
  return ['draft', 'sync_error', 'rejected'].includes(listing.status);
}

function platformKey(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function knownPlatform(value: string) {
  return ['shopee', 'mercado_livre', 'mercadolivre', 'mercado_livre', 'tiktok_shop'].includes(
    platformKey(value),
  );
}

function platformLabel(value: string) {
  const key = platformKey(value);
  if (key === 'shopee') return 'Shopee';
  if (['mercado_livre', 'mercadolivre', 'mercado_livre'].includes(key)) return 'Mercado Livre';
  if (key === 'tiktok_shop') return 'TikTok Shop';
  return value || 'Outra plataforma';
}
