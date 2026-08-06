'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, PackageOpen, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

interface SupplierProduct {
  _id: string;
  name: string;
  supplierSku: string;
  category?: string;
  brand?: string;
  costPrice: number;
  suggestedPrice: number;
  stock: number;
  minStock: number;
  status: string;
  allowSellers: boolean;
}

interface ListResponse {
  items: SupplierProduct[];
  total: number;
}

export default function SupplierProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-products', search],
    queryFn: () =>
      api.get<ListResponse>(`/dropshipping/supplier/products?search=${encodeURIComponent(search)}`),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/dropshipping/supplier/products', body),
    onSuccess: () => {
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ['supplier-products'] });
    },
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post(`/dropshipping/supplier/products/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-products'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/dropshipping/supplier/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-products'] }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Meus produtos" subtitle={`${data?.total ?? 0} produtos cadastrados`}>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Pesquisar produto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setFormOpen((v) => !v)}>
          <Plus size={15} />
          Novo produto
        </Button>
      </PageHeader>

      {formOpen && (
        <ProductForm loading={create.isPending} onSubmit={(body) => create.mutate(body)} />
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/80 text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-3">Produto</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Custo</th>
                <th className="px-3 py-3">Sugerido</th>
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
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))}
              {data?.items.map((product) => (
                <tr key={product._id} className="border-b border-border/60 hover:bg-surface-2/70">
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted">{product.supplierSku}</p>
                  </td>
                  <td className="px-3 py-3 text-muted">{product.category || '-'}</td>
                  <td className="nums px-3 py-3">{money(product.costPrice)}</td>
                  <td className="nums px-3 py-3">{money(product.suggestedPrice)}</td>
                  <td className="nums px-3 py-3">
                    <span className={product.stock <= product.minStock ? 'text-warning' : ''}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={product.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        aria-label="Duplicar"
                        onClick={() => duplicate.mutate(product._id)}
                      >
                        <Copy size={15} />
                      </IconButton>
                      <IconButton
                        tone="danger"
                        aria-label="Excluir"
                        onClick={() =>
                          confirm('Excluir ou arquivar este produto?') && remove.mutate(product._id)
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !data?.items.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
                      <PackageOpen size={28} />
                      <p className="text-sm">
                        Cadastre seu primeiro produto para liberar o catálogo dos vendedores.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProductForm({
  loading,
  onSubmit,
}: {
  loading: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    supplierSku: '',
    category: '',
    brand: '',
    costPrice: '',
    suggestedPrice: '',
    stock: '',
    minStock: '',
    description: '',
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      costPrice: Number(form.costPrice),
      suggestedPrice: Number(form.suggestedPrice),
      stock: Number(form.stock),
      minStock: Number(form.minStock),
      variations: [],
    });
  }

  return (
    <Card className="mb-4">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
        {[
          ['name', 'Nome do produto'],
          ['supplierSku', 'SKU interno'],
          ['category', 'Categoria'],
          ['brand', 'Marca'],
          ['costPrice', 'Preço de custo'],
          ['suggestedPrice', 'Preço sugerido'],
          ['stock', 'Estoque'],
          ['minStock', 'Estoque mínimo'],
        ].map(([key, label]) => (
          <Input
            key={key}
            required={key === 'name' || key === 'supplierSku'}
            placeholder={label}
            value={form[key as keyof typeof form]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            type={
              key.toLowerCase().includes('price') || key.toLowerCase().includes('stock')
                ? 'number'
                : 'text'
            }
          />
        ))}
        <div className="md:col-span-4">
          <Input
            placeholder="Descrição resumida"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="md:col-span-4">
          <Button loading={loading} type="submit">
            Salvar produto
          </Button>
        </div>
      </form>
    </Card>
  );
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
