'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  Heart,
  PackageOpen,
  Search,
  ShoppingBag,
  Store,
  Tags,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, IconButton, Input, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { formatBRL } from '@/lib/utils';

interface CatalogSupplier {
  id: string;
  name: string;
  logoUrl?: string;
  productCount: number;
  stock: number;
  categories: string[];
  minPrice: number;
  maxPrice: number;
  salesCount: number;
  images: string[];
}

interface CatalogProduct {
  _id: string;
  name: string;
  supplierSku: string;
  category?: string;
  brand?: string;
  images?: string[];
  costPrice: number;
  platformFee?: number;
  shoppingPrice?: number;
  suggestedPrice: number;
  stock: number;
  minStock: number;
  variations?: Record<string, unknown>[];
  salesCount?: number;
  supplierUserId?: string;
  supplier?: CatalogSupplier | null;
}

interface CatalogResponse {
  items: CatalogProduct[];
  suppliers: CatalogSupplier[];
  total: number;
}

export default function SellerCatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const supplierCatalog = useQuery({
    queryKey: ['seller-catalog-suppliers'],
    queryFn: () => api.get<CatalogResponse>('/dropshipping/seller/catalog?limit=1'),
  });

  const selectedSupplier = useMemo(
    () => supplierCatalog.data?.suppliers.find((supplier) => supplier.id === selectedSupplierId),
    [selectedSupplierId, supplierCatalog.data?.suppliers],
  );

  const productCatalog = useQuery({
    queryKey: ['seller-catalog', selectedSupplierId, search],
    enabled: Boolean(selectedSupplierId),
    queryFn: () =>
      api.get<CatalogResponse>(
        `/dropshipping/seller/catalog?supplier=${encodeURIComponent(
          selectedSupplierId ?? '',
        )}&search=${encodeURIComponent(search)}&limit=60`,
      ),
  });

  const visibleSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const suppliers = supplierCatalog.data?.suppliers ?? [];
    if (!term) return suppliers;
    return suppliers.filter((supplier) => {
      const haystack = [supplier.name, ...supplier.categories].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [search, supplierCatalog.data?.suppliers]);

  const prepare = useMutation({
    mutationFn: (product: CatalogProduct) =>
      api.post('/dropshipping/seller/listings', {
        supplierProductId: product._id,
        title: product.name,
        description: `${product.name}\n\nProduto enviado pelo fornecedor parceiro.`,
        categoryId: '',
        stockToPublish: product.stock,
        pricing: { mode: 'platform_fee' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-listings'] }),
  });

  const products = productCatalog.data?.items ?? [];
  const showingSupplier = Boolean(selectedSupplierId);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Shopping"
        subtitle={
          showingSupplier
            ? `Catálogo digital de ${selectedSupplier?.name ?? 'fornecedor'}`
            : `${visibleSuppliers.length} fornecedores disponíveis`
        }
      >
        {showingSupplier && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedSupplierId(null);
              setSearch('');
            }}
          >
            <ArrowLeft size={15} />
            Fornecedores
          </Button>
        )}
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder={showingSupplier ? 'Pesquisar produto' : 'Pesquisar fornecedor'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageHeader>

      {!showingSupplier ? (
        <SupplierGrid
          suppliers={visibleSuppliers}
          loading={supplierCatalog.isLoading}
          onSelect={(supplier) => {
            setSelectedSupplierId(supplier.id);
            setSearch('');
          }}
        />
      ) : (
        <SupplierCatalog
          supplier={selectedSupplier}
          products={products}
          loading={productCatalog.isLoading}
          preparing={prepare.isPending}
          onImport={(product) => prepare.mutate(product)}
        />
      )}
    </div>
  );
}

function SupplierGrid({
  suppliers,
  loading,
  onSelect,
}: {
  suppliers: CatalogSupplier[];
  loading: boolean;
  onSelect: (supplier: CatalogSupplier) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-[1.25rem]" />
        ))}
      </div>
    );
  }

  if (!suppliers.length) {
    return (
      <Card className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-muted">
        <Store size={30} />
        <p className="text-sm">Nenhum fornecedor aprovado disponível no momento.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {suppliers.map((supplier) => (
        <button
          key={supplier.id}
          type="button"
          onClick={() => onSelect(supplier)}
          className="card group flex min-h-72 flex-col p-5 text-left transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-2">
              {supplier.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={supplier.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Store size={22} className="text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-base font-semibold">{supplier.name}</p>
              <p className="mt-1 text-xs text-muted">Catálogo digital do fornecedor</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:translate-x-0.5">
              <ChevronRight size={18} />
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <SupplierStat label="Produtos" value={String(supplier.productCount)} />
            <SupplierStat label="Estoque" value={String(supplier.stock)} />
            <SupplierStat label="Vendidos" value={String(supplier.salesCount)} />
          </div>

          <div className="mt-4 grid h-24 grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => {
              const image = supplier.images[index];
              return (
                <div
                  key={`${supplier.id}-image-${index}`}
                  className="overflow-hidden rounded-2xl border border-border bg-surface-2"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-faint">
                      <PackageOpen size={18} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {supplier.categories.length ? (
              supplier.categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
                >
                  {category}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
                Sem categoria
              </span>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <p className="text-xs text-muted">
              Faixa de custo{' '}
              <span className="nums font-semibold text-fg">
                {formatBRL(supplier.minPrice)} - {formatBRL(supplier.maxPrice)}
              </span>
            </p>
            <span className="text-xs font-semibold text-primary">Abrir</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function SupplierCatalog({
  supplier,
  products,
  loading,
  preparing,
  onImport,
}: {
  supplier?: CatalogSupplier;
  products: CatalogProduct[];
  loading: boolean;
  preparing: boolean;
  onImport: (product: CatalogProduct) => void;
}) {
  return (
    <div className="space-y-4">
      {supplier && (
        <section className="rounded-[1.25rem] border border-border bg-surface p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-2">
                {supplier.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={supplier.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Store size={24} className="text-primary" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{supplier.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {supplier.productCount} produtos liberados para venda
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-96">
              <Info label="Produtos" value={String(supplier.productCount)} icon={Tags} />
              <Info label="Estoque" value={String(supplier.stock)} icon={Boxes} />
              <Info label="Custo" value={formatBRL(supplier.minPrice)} icon={ShoppingBag} />
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[1.25rem]" />
          ))}
        {!loading &&
          products.map((product) => {
            const platformFee = product.platformFee ?? 0;
            const finalPrice = product.shoppingPrice ?? product.costPrice + platformFee;
            return (
              <Card key={product._id} className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border">
                    {product.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-faint">
                        <PackageOpen size={20} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{product.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {product.category || product.brand || 'Sem categoria'}
                    </p>
                  </div>
                  <IconButton aria-label="Favoritar">
                    <Heart size={16} />
                  </IconButton>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <ProductInfo label="Fornecedor" value={formatBRL(product.costPrice)} />
                  <ProductInfo label="Taxa plataforma" value={formatBRL(platformFee)} />
                  <ProductInfo label="Valor Shopping" value={formatBRL(finalPrice)} />
                  <ProductInfo label="Estoque" value={String(product.stock)} />
                </div>

                <p className="text-xs text-muted">
                  O valor do Shopping soma o preço do fornecedor com a taxa da plataforma.
                </p>
                <Button loading={preparing} onClick={() => onImport(product)}>
                  <ShoppingBag size={15} />
                  Importar para minha loja
                </Button>
              </Card>
            );
          })}
      </div>

      {!loading && !products.length && (
        <Card className="flex flex-col items-center gap-2 py-16 text-center text-muted">
          <PackageOpen size={28} />
          <p className="text-sm">Nenhum produto encontrado nesse catálogo.</p>
        </Card>
      )}
    </div>
  );
}

function SupplierStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="nums mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Tags; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint">
        <Icon size={13} />
        {label}
      </div>
      <p className="nums mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function ProductInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="nums mt-1 font-medium">{value}</p>
    </div>
  );
}
