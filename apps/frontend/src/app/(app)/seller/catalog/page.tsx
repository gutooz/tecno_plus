'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, PackageOpen, Search, ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, IconButton, Input, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface CatalogProduct {
  _id: string;
  name: string;
  supplierSku: string;
  category?: string;
  brand?: string;
  images?: string[];
  costPrice: number;
  suggestedPrice: number;
  stock: number;
  minStock: number;
  variations?: Record<string, unknown>[];
  salesCount?: number;
}

interface CatalogResponse {
  items: CatalogProduct[];
  total: number;
}

export default function SellerCatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [profitPercent, setProfitPercent] = useState(35);

  const { data, isLoading } = useQuery({
    queryKey: ['seller-catalog', search],
    queryFn: () =>
      api.get<CatalogResponse>(`/dropshipping/seller/catalog?search=${encodeURIComponent(search)}`),
  });

  const prepare = useMutation({
    mutationFn: (product: CatalogProduct) =>
      api.post('/dropshipping/seller/listings', {
        supplierProductId: product._id,
        title: product.name,
        description: `${product.name}\n\nProduto enviado pelo fornecedor parceiro.`,
        categoryId: '',
        stockToPublish: product.stock,
        pricing: { mode: 'percent', profitPercent },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-listings'] }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Catálogo de fornecedores"
        subtitle={`${data?.total ?? 0} produtos disponíveis`}
      >
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Pesquisar produto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input
          className="w-32"
          type="number"
          min={0}
          value={profitPercent}
          onChange={(e) => setProfitPercent(Number(e.target.value))}
          aria-label="Margem percentual"
        />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-3xl" />
          ))}
        {data?.items.map((product) => {
          const finalPrice = product.costPrice * (1 + profitPercent / 100);
          const profit = finalPrice - product.costPrice;
          return (
            <Card key={product._id} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border">
                  {product.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
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
                <Info label="Custo" value={money(product.costPrice)} />
                <Info label="Preço final" value={money(finalPrice)} />
                <Info label="Lucro bruto" value={money(profit)} />
                <Info label="Estoque" value={String(product.stock)} />
              </div>

              <p className="text-xs text-muted">
                Taxas estimadas podem variar e não devem ser tratadas como valor garantido.
              </p>
              <Button loading={prepare.isPending} onClick={() => prepare.mutate(product)}>
                <ShoppingBag size={15} />
                Importar para minha loja
              </Button>
            </Card>
          );
        })}
      </div>

      {!isLoading && !data?.items.length && (
        <Card className="flex flex-col items-center gap-2 py-16 text-center text-muted">
          <PackageOpen size={28} />
          <p className="text-sm">Nenhum produto aprovado para venda no momento.</p>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className="nums mt-1 font-medium">{value}</p>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
