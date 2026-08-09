'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Copy,
  ImagePlus,
  Link2,
  PackageOpen,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Unlink,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, IconButton, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

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
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  gtin?: string;
  images: string[];
  status: string;
  allowSellers: boolean;
}

interface ListResponse {
  items: SupplierProduct[];
  total: number;
}

const ACTIVE_STATUSES = 'active,inactive,archived';

export default function SupplierProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-products', search],
    queryFn: () =>
      api.get<ListResponse>(
        `/dropshipping/supplier/products?status=${ACTIVE_STATUSES}&search=${encodeURIComponent(search)}`,
      ),
  });

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ['supplier-products-pending'],
    queryFn: () => api.get<ListResponse>('/dropshipping/supplier/products?status=pending_review'),
    refetchInterval: 15000, // fotos podem chegar pelo Telegram a qualquer momento
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['supplier-products'] });
    qc.invalidateQueries({ queryKey: ['supplier-products-pending'] });
  };

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

  const savePending = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/dropshipping/supplier/products/${id}`, body),
    onSuccess: invalidateAll,
  });

  const deletePending = useMutation({
    mutationFn: (id: string) => api.del(`/dropshipping/supplier/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-products-pending'] }),
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

      <TelegramCard />

      <PhotoIntake
        onUploaded={() => qc.invalidateQueries({ queryKey: ['supplier-products-pending'] })}
      />

      {formOpen && (
        <ProductForm loading={create.isPending} onSubmit={(body) => create.mutate(body)} />
      )}

      {(pendingLoading || Boolean(pending?.items.length)) && (
        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">
              {pendingLoading
                ? 'Carregando pendentes…'
                : `${pending?.items.length} aguardando dados`}
            </h2>
          </div>
          {pendingLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence>
                {pending?.items.map((item) => (
                  <PendingCard
                    key={item._id}
                    item={item}
                    saving={savePending.isPending && savePending.variables?.id === item._id}
                    deleting={deletePending.isPending && deletePending.variables === item._id}
                    onSave={(body) => savePending.mutate({ id: item._id, body })}
                    onDelete={() => {
                      if (confirm('Descartar esta foto pendente?')) deletePending.mutate(item._id);
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
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
                    <div className="flex items-center gap-3">
                      {product.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0]}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-faint ring-1 ring-border/60">
                          <PackageOpen size={16} />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted">{product.supplierSku}</p>
                      </div>
                    </div>
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

/* ── Conectar Telegram ──────────────────────────────────────── */
interface TelegramStatusResponse {
  linked: boolean;
}
interface TelegramLinkResponse {
  code: string;
  expiresAt: string;
  botUsername?: string;
}

function TelegramCard() {
  const qc = useQueryClient();
  const [linkInfo, setLinkInfo] = useState<TelegramLinkResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['supplier-telegram-status'],
    queryFn: () => api.get<TelegramStatusResponse>('/dropshipping/supplier/telegram/status'),
  });

  const link = useMutation({
    mutationFn: () => api.post<TelegramLinkResponse>('/dropshipping/supplier/telegram/link'),
    onSuccess: (res) => setLinkInfo(res),
  });

  const unlink = useMutation({
    mutationFn: () => api.post('/dropshipping/supplier/telegram/unlink'),
    onSuccess: () => {
      setLinkInfo(null);
      qc.invalidateQueries({ queryKey: ['supplier-telegram-status'] });
    },
  });

  const command = linkInfo ? `/vincular ${linkInfo.code}` : '';
  const deepLink =
    linkInfo?.botUsername && linkInfo
      ? `https://t.me/${linkInfo.botUsername}?start=${linkInfo.code}`
      : null;

  function copyCommand() {
    if (!command) return;
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Send size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">Cadastro por foto no Telegram</p>
            {isLoading ? (
              <p className="text-xs text-muted">Verificando vínculo…</p>
            ) : status?.linked ? (
              <p className="text-xs text-success">
                Conectado — fotos enviadas no chat viram produtos pendentes aqui.
              </p>
            ) : (
              <p className="text-xs text-muted">
                Vincule um chat do Telegram e mande fotos direto pra cá.
              </p>
            )}
          </div>
        </div>
        {!isLoading &&
          (status?.linked ? (
            <Button
              variant="outline"
              size="sm"
              loading={unlink.isPending}
              onClick={() => confirm('Desvincular o chat do Telegram?') && unlink.mutate()}
            >
              <Unlink size={15} />
              Desvincular
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              loading={link.isPending}
              onClick={() => link.mutate()}
            >
              <Link2 size={15} />
              Gerar código
            </Button>
          ))}
      </div>

      {linkInfo && !status?.linked && (
        <div className="mt-4 rounded-2xl border border-border bg-surface-2/60 p-4 text-sm">
          <p className="text-muted">
            1. Abra o bot da Tecno Plus no Telegram
            {deepLink && (
              <>
                {' '}
                (
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  abrir agora
                </a>
                )
              </>
            )}
            .
          </p>
          <p className="mt-1 text-muted">2. Envie esta mensagem no chat:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-surface px-3 py-2 font-mono text-sm ring-1 ring-border/60">
              {command}
            </code>
            <IconButton aria-label="Copiar" onClick={copyCommand}>
              {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
            </IconButton>
          </div>
          <p className="mt-2 text-xs text-faint">
            Código válido até {new Date(linkInfo.expiresAt).toLocaleTimeString('pt-BR')}.
          </p>
        </div>
      )}
    </Card>
  );
}

/* ── Envio de fotos (web) ────────────────────────────────────── */
interface Preview {
  file: File;
  url: string;
}

function PhotoIntake({ onUploaded }: { onUploaded: () => void }) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  function addFiles(files: FileList | File[]) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPreviews((prev) => [
      ...prev,
      ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function send() {
    if (!previews.length) return;
    setUploading(true);
    setProgress(0);
    try {
      await api.uploadTo(
        '/dropshipping/supplier/products/photos',
        previews.map((p) => p.file),
        setProgress,
      );
      setPreviews([]);
      onUploaded();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="mb-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-32 flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed p-6 text-center transition-all duration-200 ease-out-soft',
          dragging
            ? 'border-primary bg-primary/[0.06] scale-[1.005]'
            : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2/50',
        )}
      >
        <UploadCloud size={20} className="text-primary" />
        <div>
          <p className="text-sm font-medium">Arraste fotos dos produtos aqui</p>
          <p className="mt-0.5 text-xs text-muted">
            ou selecione do computador — elas ficam pendentes pra você anotar nome, preço, estoque e
            peso
          </p>
        </div>
        <label>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg shadow-xs transition-all duration-200 ease-out-soft hover:bg-surface-3 active:scale-[0.97]">
            <ImagePlus size={15} />
            Selecionar fotos
          </span>
        </label>
      </div>

      {previews.length > 0 && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {previews.length} foto(s) selecionada(s)
              {uploading && <span className="nums font-medium text-primary"> — {progress}%</span>}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => setPreviews([])}
              >
                <Trash2 size={15} />
                Limpar
              </Button>
              <Button size="sm" loading={uploading} onClick={send}>
                {!uploading && <Send size={15} />}
                {uploading ? 'Enviando…' : 'Enviar fotos'}
              </Button>
            </div>
          </div>
          {uploading && (
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
          )}
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
            <AnimatePresence>
              {previews.map((p, i) => (
                <motion.div
                  key={p.url}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border ring-1 ring-border/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {!uploading && (
                    <button
                      onClick={() => setPreviews((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100"
                      aria-label="Remover"
                    >
                      <X size={12} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Card de item pendente (foto do Telegram/web aguardando dados) ─── */
function PendingCard({
  item,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  item: SupplierProduct;
  saving: boolean;
  deleting: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    name: item.name === 'Produto (foto pendente)' ? '' : item.name,
    supplierSku: item.supplierSku,
    category: item.category ?? '',
    brand: item.brand ?? '',
    costPrice: item.costPrice ? String(item.costPrice) : '',
    suggestedPrice: item.suggestedPrice ? String(item.suggestedPrice) : '',
    stock: item.stock ? String(item.stock) : '',
    weight: item.weight ? String(item.weight) : '',
    length: item.dimensions?.length ? String(item.dimensions.length) : '',
    width: item.dimensions?.width ? String(item.dimensions.width) : '',
    height: item.dimensions?.height ? String(item.dimensions.height) : '',
    gtin: item.gtin ?? '',
  });

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function num(value: string) {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  function save() {
    const length = num(form.length);
    const width = num(form.width);
    const height = num(form.height);
    onSave({
      name: form.name,
      supplierSku: form.supplierSku,
      category: form.category,
      brand: form.brand,
      costPrice: num(form.costPrice) ?? 0,
      suggestedPrice: num(form.suggestedPrice) ?? 0,
      stock: num(form.stock) ?? 0,
      weight: num(form.weight),
      dimensions:
        length != null && width != null && height != null ? { length, width, height } : undefined,
      gtin: form.gtin,
      allowSellers: true,
      status: 'active',
    });
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
    >
      <Card className="flex h-full flex-col gap-3 p-3.5">
        <div className="flex items-start gap-3">
          {item.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.images[0]}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-border/60"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-faint ring-1 ring-border/60">
              <PackageOpen size={20} />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
              placeholder="Nome do produto"
            />
            <Input
              value={form.supplierSku}
              onChange={(e) => field('supplierSku', e.target.value)}
              placeholder="SKU interno"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input
            value={form.category}
            onChange={(e) => field('category', e.target.value)}
            placeholder="Categoria"
          />
          <Input
            value={form.brand}
            onChange={(e) => field('brand', e.target.value)}
            placeholder="Marca"
          />
          <Input
            inputMode="decimal"
            value={form.costPrice}
            onChange={(e) => field('costPrice', e.target.value)}
            placeholder="Preço de custo"
          />
          <Input
            inputMode="decimal"
            value={form.suggestedPrice}
            onChange={(e) => field('suggestedPrice', e.target.value)}
            placeholder="Preço sugerido"
          />
          <Input
            inputMode="numeric"
            value={form.stock}
            onChange={(e) => field('stock', e.target.value)}
            placeholder="Estoque"
          />
          <Input
            inputMode="decimal"
            value={form.weight}
            onChange={(e) => field('weight', e.target.value)}
            placeholder="Peso (kg) *Shopee"
          />
          <Input
            value={form.gtin}
            onChange={(e) => field('gtin', e.target.value)}
            placeholder="GTIN/EAN"
          />
        </div>

        <div>
          <p className="mb-1 text-xs text-muted">Dimensões do pacote — C × L × A (cm)</p>
          <div className="grid grid-cols-3 gap-2">
            <Input
              inputMode="decimal"
              value={form.length}
              onChange={(e) => field('length', e.target.value)}
              placeholder="Compr."
            />
            <Input
              inputMode="decimal"
              value={form.width}
              onChange={(e) => field('width', e.target.value)}
              placeholder="Larg."
            />
            <Input
              inputMode="decimal"
              value={form.height}
              onChange={(e) => field('height', e.target.value)}
              placeholder="Alt."
            />
          </div>
        </div>

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            className="flex-1"
            size="sm"
            loading={saving}
            disabled={!form.name.trim()}
            onClick={save}
          >
            {!saving && <Save size={15} />}
            Salvar
          </Button>
          <IconButton tone="danger" disabled={deleting} onClick={onDelete} aria-label="Excluir">
            <Trash2 size={15} />
          </IconButton>
        </div>
      </Card>
    </motion.div>
  );
}

/* ── Formulário manual ───────────────────────────────────────── */
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
    weight: '',
    length: '',
    width: '',
    height: '',
    gtin: '',
    description: '',
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const length = Number(form.length.replace(',', '.'));
    const width = Number(form.width.replace(',', '.'));
    const height = Number(form.height.replace(',', '.'));
    const hasDims = form.length && form.width && form.height;
    onSubmit({
      ...form,
      costPrice: Number(form.costPrice),
      suggestedPrice: Number(form.suggestedPrice),
      stock: Number(form.stock),
      minStock: Number(form.minStock),
      weight: form.weight ? Number(form.weight.replace(',', '.')) : undefined,
      dimensions: hasDims ? { length, width, height } : undefined,
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
          ['weight', 'Peso (kg) — obrigatório p/ Shopee'],
          ['gtin', 'GTIN/EAN (código de barras)'],
        ].map(([key, label]) => (
          <Input
            key={key}
            required={key === 'name' || key === 'supplierSku'}
            placeholder={label}
            value={form[key as keyof typeof form]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            type={
              key.toLowerCase().includes('price') ||
              key === 'stock' ||
              key === 'minStock' ||
              key === 'weight'
                ? 'number'
                : 'text'
            }
          />
        ))}
        <div className="md:col-span-4">
          <p className="mb-1 text-xs text-muted">Dimensões do pacote — C × L × A (cm)</p>
          <div className="grid grid-cols-3 gap-2 md:max-w-md">
            <Input
              placeholder="Comprimento"
              value={form.length}
              onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
            />
            <Input
              placeholder="Largura"
              value={form.width}
              onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
            />
            <Input
              placeholder="Altura"
              value={form.height}
              onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
            />
          </div>
        </div>
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
