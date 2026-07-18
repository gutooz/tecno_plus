'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Facebook,
  Instagram,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn, formatBRL } from '@/lib/utils';

type Channel = 'facebook' | 'instagram';

const CHANNEL_LABEL: Record<Channel, string> = { facebook: 'Facebook', instagram: 'Instagram' };
const CHANNEL_ICON: Record<Channel, typeof Facebook> = { facebook: Facebook, instagram: Instagram };

interface ProductSummary {
  id: string;
  internalSku: string;
  title: string;
  image: string;
}

interface SocialApproval {
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  caption: string;
  scheduledAt: string;
  postedAt?: string;
}

interface HistoryPost extends ProductSummary {
  socialApproval: SocialApproval;
}

interface PlanCandidate extends ProductSummary {
  previewCaption: string;
}

interface OrganicItem {
  productId: string;
  scheduledFor: string;
  status: 'queued' | 'sent_for_approval' | 'posted' | 'skipped';
}

interface OrganicCampaign {
  _id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  organic: { channels: string[]; intervalDays: number; startDate: string; items: OrganicItem[] };
  createdAt: string;
}

interface PaidCampaign {
  _id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  paid: {
    objective: string;
    dailyBudgetCents: number;
    currency: string;
    external: { campaignId?: string };
    lastError?: string;
  };
  createdAt: string;
}

interface ProductSearchItem {
  _id: string;
  internalSku: string;
  vision?: { name?: string };
  content?: { title?: string };
  images?: { hd?: string; square?: string; thumbnail?: string };
}

function productTitle(p: ProductSearchItem): string {
  return p.content?.title || p.vision?.name || p.internalSku;
}
function productImage(p: ProductSearchItem): string {
  return p.images?.square || p.images?.thumbnail || p.images?.hd || '';
}

export default function ChannelManagePage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: rawChannel } = use(params);
  const router = useRouter();
  const channel = (
    rawChannel === 'facebook' || rawChannel === 'instagram' ? rawChannel : null
  ) as Channel | null;

  useEffect(() => {
    if (!channel) router.replace('/integrations');
  }, [channel, router]);

  if (!channel) return null;
  return <ChannelManageContent channel={channel} />;
}

function ChannelManageContent({ channel }: { channel: Channel }) {
  const queryClient = useQueryClient();
  const Icon = CHANNEL_ICON[channel];
  const [historyFilter, setHistoryFilter] = useState<string>('');

  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () =>
      api.get<{ channels: { channel: string; paidAdsConfigured?: boolean }[] }>('/integrations'),
  });
  const paidAdsConfigured =
    integrations.data?.channels.find((c) => c.channel === channel)?.paidAdsConfigured ?? false;

  const history = useQuery({
    queryKey: ['social', 'history', historyFilter],
    queryFn: () =>
      api.get<{ posts: HistoryPost[] }>(
        `/social/history${historyFilter ? `?status=${historyFilter}` : ''}`,
      ),
  });

  const planPreview = useQuery({
    queryKey: ['social', 'plan-preview'],
    queryFn: () => api.get<{ candidates: PlanCandidate[] }>('/social/plan-preview?days=7'),
  });

  const organicCampaigns = useQuery({
    queryKey: ['campaigns', 'organic'],
    queryFn: () => api.get<OrganicCampaign[]>('/campaigns?type=organic'),
  });

  const paidCampaigns = useQuery({
    queryKey: ['campaigns', 'paid'],
    queryFn: () => api.get<PaidCampaign[]>('/campaigns?type=paid'),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['social'] });
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/integrations"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={14} /> Integrações
      </Link>
      <PageHeader
        title={CHANNEL_LABEL[channel]}
        subtitle="Prévia da IA, posts manuais e campanhas — complementa a aprovação pelo Telegram, que continua funcionando normalmente."
      />

      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon size={18} />
        </span>
        <p className="text-sm text-muted">
          Publicação automática 1x/dia com aprovação via Telegram, mais o que você criar aqui
          manualmente.
        </p>
      </div>

      <WeeklyPlan data={planPreview.data} loading={planPreview.isLoading} />

      <ManualPostForm channel={channel} onCreated={invalidateAll} />

      <PostHistory
        posts={history.data?.posts}
        loading={history.isLoading}
        filter={historyFilter}
        onFilterChange={setHistoryFilter}
      />

      <OrganicCampaigns
        channel={channel}
        campaigns={organicCampaigns.data}
        loading={organicCampaigns.isLoading}
        onChanged={invalidateAll}
      />

      <PaidCampaigns
        channel={channel}
        campaigns={paidCampaigns.data}
        loading={paidCampaigns.isLoading}
        configured={paidAdsConfigured}
        onChanged={invalidateAll}
      />
    </div>
  );
}

/* ── Prévia da semana ──────────────────────────────────────── */
function WeeklyPlan({
  data,
  loading,
}: {
  data?: { candidates: PlanCandidate[] };
  loading: boolean;
}) {
  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock size={16} className="text-primary" />
        <p className="font-semibold">Prévia da semana</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        O que a automação postaria a seguir, um produto por vez — é só uma prévia calculada agora,
        não uma fila fixa (a escolha real acontece no dia).
      </p>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !data?.candidates.length ? (
        <p className="text-sm text-muted">
          Nenhum produto pronto aguardando divulgação social no momento.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.candidates.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-lg bg-surface-3" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="truncate text-xs text-muted">{c.previewCaption}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Busca de produto (reaproveitado no post manual e nas campanhas) ── */
function useProductSearch() {
  const [term, setTerm] = useState('');
  const query = useQuery({
    queryKey: ['products', 'search', term],
    queryFn: () =>
      api.get<{ items: ProductSearchItem[] }>(
        `/products?search=${encodeURIComponent(term)}&limit=8`,
      ),
    enabled: term.trim().length > 1,
  });
  return {
    term,
    setTerm,
    results: term.trim().length > 1 ? (query.data?.items ?? []) : [],
    loading: query.isFetching,
  };
}

/* ── Criar post manual ────────────────────────────────────── */
function ManualPostForm({ channel, onCreated }: { channel: Channel; onCreated: () => void }) {
  const search = useProductSearch();
  const [selected, setSelected] = useState<ProductSearchItem | null>(null);
  const [mode, setMode] = useState<'approval' | 'immediate'>('approval');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/social/posts', { productId: selected!._id, mode }),
    onSuccess: () => {
      setSelected(null);
      search.setTerm('');
      setError('');
      onCreated();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Card className="mb-4">
      <p className="mb-3 font-semibold">Criar post manual</p>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle size={14} className="shrink-0" /> {error}
        </div>
      )}

      {selected ? (
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
          {productImage(selected) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productImage(selected)} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="h-9 w-9 rounded-lg bg-surface-3" />
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{productTitle(selected)}</p>
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
            Trocar
          </Button>
        </div>
      ) : (
        <div className="relative mb-3">
          <Input
            leadingIcon={<Search size={15} />}
            placeholder="Buscar produto pelo nome ou SKU…"
            value={search.term}
            onChange={(e) => search.setTerm(e.target.value)}
          />
          {search.term.trim().length > 1 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-md">
              {search.loading ? (
                <p className="px-3 py-2 text-sm text-muted">Buscando…</p>
              ) : search.results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Nenhum produto encontrado.</p>
              ) : (
                search.results.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    {productImage(p) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={productImage(p)}
                        alt=""
                        className="h-7 w-7 rounded-md object-cover"
                      />
                    ) : (
                      <span className="h-7 w-7 rounded-md bg-surface-3" />
                    )}
                    <span className="truncate">{productTitle(p)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === 'approval'}
            onChange={() => setMode('approval')}
            className="accent-primary"
          />
          Enviar para aprovação no Telegram (padrão)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === 'immediate'}
            onChange={() => setMode('immediate')}
            className="accent-primary"
          />
          Publicar agora, sem aprovação
        </label>
      </div>

      <Button
        size="sm"
        disabled={!selected}
        loading={create.isPending}
        onClick={() => create.mutate()}
      >
        <Send size={15} />{' '}
        {mode === 'approval' ? 'Enviar para aprovação' : `Publicar em ${CHANNEL_LABEL[channel]}`}
      </Button>
    </Card>
  );
}

/* ── Histórico de posts ───────────────────────────────────── */
const HISTORY_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendente' },
  { value: 'posted', label: 'Publicado' },
  { value: 'rejected', label: 'Rejeitado' },
];

function PostHistory({
  posts,
  loading,
  filter,
  onFilterChange,
}: {
  posts?: HistoryPost[];
  loading: boolean;
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Histórico de posts</p>
        <div className="flex gap-1">
          {HISTORY_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                filter === f.value ? 'bg-primary/12 text-primary' : 'text-muted hover:bg-surface-2',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : !posts?.length ? (
        <p className="text-sm text-muted">Nenhum post ainda.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-lg bg-surface-3" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="truncate text-xs text-muted">{p.socialApproval.caption}</p>
              </div>
              <StatusPill status={p.socialApproval.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Campanhas orgânicas ──────────────────────────────────── */
function OrganicCampaigns({
  channel,
  campaigns,
  loading,
  onChanged,
}: {
  channel: Channel;
  campaigns?: OrganicCampaign[];
  loading: boolean;
  onChanged: () => void;
}) {
  const search = useProductSearch();
  const [selected, setSelected] = useState<ProductSearchItem[]>([]);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [intervalDays, setIntervalDays] = useState('1');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/campaigns/organic', {
        name,
        productIds: selected.map((p) => p._id),
        channels: [channel],
        startDate,
        intervalDays: Number(intervalDays) || 1,
      }),
    onSuccess: () => {
      setName('');
      setSelected([]);
      setError('');
      onChanged();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      api.patch(`/campaigns/organic/${id}/status`, { status }),
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/campaigns/organic/${id}`),
    onSuccess: onChanged,
  });

  const addProduct = (p: ProductSearchItem) => {
    if (!selected.some((s) => s._id === p._id)) setSelected((prev) => [...prev, p]);
    search.setTerm('');
  };

  return (
    <Card className="mb-4">
      <p className="mb-1 font-semibold">Campanhas orgânicas</p>
      <p className="mb-3 text-xs text-muted">
        Agenda vários posts em lote, sem custo — cada um segue o mesmo fluxo de aprovação pelo
        Telegram na sua data.
      </p>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : campaigns?.length ? (
        <ul className="mb-4 space-y-2">
          {campaigns.map((c) => {
            const posted = c.organic.items.filter((i) => i.status !== 'queued').length;
            return (
              <li
                key={c._id}
                className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted">
                    {posted}/{c.organic.items.length} itens disparados · a cada{' '}
                    {c.organic.intervalDays}d
                  </p>
                </div>
                <StatusPill status={c.status} />
                {c.status === 'active' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: c._id, status: 'paused' })}
                  >
                    <Pause size={14} />
                  </Button>
                ) : c.status !== 'archived' && c.status !== 'completed' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: c._id, status: 'active' })}
                  >
                    <Play size={14} />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  loading={remove.isPending}
                  onClick={() => remove.mutate(c._id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Nenhuma campanha orgânica ainda.</p>
      )}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle size={14} className="shrink-0" /> {error}
        </div>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
        Nova campanha
      </p>
      <div className="mb-2.5">
        <Input
          placeholder="Nome da campanha"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {selected.length > 0 && (
        <ul className="mb-2.5 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <li
              key={p._id}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs text-primary"
            >
              {productTitle(p)}
              <button
                onClick={() => setSelected((prev) => prev.filter((s) => s._id !== p._id))}
                aria-label="Remover"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mb-2.5">
        <Input
          leadingIcon={<Search size={15} />}
          placeholder="Adicionar produto…"
          value={search.term}
          onChange={(e) => search.setTerm(e.target.value)}
        />
        {search.term.trim().length > 1 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-md">
            {search.loading ? (
              <p className="px-3 py-2 text-sm text-muted">Buscando…</p>
            ) : search.results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Nenhum produto encontrado.</p>
            ) : (
              search.results.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  {productTitle(p)}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Data de início</span>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Intervalo (dias)</span>
          <Input
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
          />
        </label>
      </div>

      <Button
        size="sm"
        disabled={!name.trim() || selected.length === 0}
        loading={create.isPending}
        onClick={() => create.mutate()}
      >
        <Plus size={15} /> Criar campanha orgânica
      </Button>
    </Card>
  );
}

/* ── Campanhas pagas ──────────────────────────────────────── */
function PaidCampaigns({
  channel,
  campaigns,
  loading,
  configured,
  onChanged,
}: {
  channel: Channel;
  campaigns?: PaidCampaign[];
  loading: boolean;
  configured: boolean;
  onChanged: () => void;
}) {
  const search = useProductSearch();
  const [selected, setSelected] = useState<ProductSearchItem | null>(null);
  const [name, setName] = useState('');
  const [dailyBudget, setDailyBudget] = useState('20');
  const [countries, setCountries] = useState('BR');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('55');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/campaigns/paid', {
        name,
        productId: selected!._id,
        channel,
        objective: 'POST_ENGAGEMENT',
        dailyBudgetCents: Math.round(Number(dailyBudget) * 100),
        currency: 'BRL',
        targeting: {
          countries: countries
            .split(',')
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean),
          ageMin: Number(ageMin) || 18,
          ageMax: Number(ageMax) || 65,
        },
      }),
    onSuccess: () => {
      setName('');
      setSelected(null);
      setError('');
      onChanged();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      api.patch(`/campaigns/paid/${id}/status`, { status }),
    onSuccess: onChanged,
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/campaigns/paid/${id}`),
    onSuccess: onChanged,
  });

  const [confirmActivate, setConfirmActivate] = useState<string | null>(null);

  return (
    <Card>
      <p className="mb-1 font-semibold">Campanhas pagas</p>
      <p className="mb-3 text-xs text-muted">
        Anúncio real via Facebook Ads Manager, com gasto de verdade. Toda campanha nasce pausada —
        só é ativada quando você confirmar explicitamente.
      </p>

      {!configured ? (
        <div className="rounded-xl bg-warning/10 px-3.5 py-3 text-sm text-warning">
          Servidor sem configuração de anúncios (FACEBOOK_AD_ACCOUNT_ID / token com permissão
          ads_management) — configure antes de criar campanhas pagas.
        </div>
      ) : (
        <>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : campaigns?.length ? (
            <ul className="mb-4 space-y-2">
              {campaigns.map((c) => (
                <li
                  key={c._id}
                  className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted">
                      {formatBRL((c.paid.dailyBudgetCents ?? 0) / 100)}/dia
                      {c.paid.lastError ? ` · falhou: ${c.paid.lastError}` : ''}
                    </p>
                  </div>
                  <StatusPill status={c.status} />
                  {c.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: c._id, status: 'paused' })}
                    >
                      <Pause size={14} /> Pausar
                    </Button>
                  ) : c.status === 'paused' ? (
                    confirmActivate === c._id ? (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={setStatus.isPending}
                        onClick={() => {
                          setStatus.mutate({ id: c._id, status: 'active' });
                          setConfirmActivate(null);
                        }}
                      >
                        Confirmar gasto real
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirmActivate(c._id)}>
                        <Play size={14} /> Ativar
                      </Button>
                    )
                  ) : null}
                  {c.paid.external.campaignId && (
                    <a
                      href={`https://www.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${c.paid.external.campaignId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-fg"
                      title="Ver no Ads Manager"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={remove.isPending}
                    onClick={() => remove.mutate(c._id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">Nenhuma campanha paga ainda.</p>
          )}

          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
            Nova campanha paga
          </p>
          <div className="mb-2.5">
            <Input
              placeholder="Nome da campanha"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {selected ? (
            <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
              {productImage(selected) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productImage(selected)}
                  alt=""
                  className="h-9 w-9 rounded-lg object-cover"
                />
              ) : (
                <span className="h-9 w-9 rounded-lg bg-surface-3" />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {productTitle(selected)}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Trocar
              </Button>
            </div>
          ) : (
            <div className="relative mb-2.5">
              <Input
                leadingIcon={<Search size={15} />}
                placeholder="Produto a impulsionar…"
                value={search.term}
                onChange={(e) => search.setTerm(e.target.value)}
              />
              {search.term.trim().length > 1 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-md">
                  {search.loading ? (
                    <p className="px-3 py-2 text-sm text-muted">Buscando…</p>
                  ) : search.results.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted">Nenhum produto encontrado.</p>
                  ) : (
                    search.results.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => {
                          setSelected(p);
                          search.setTerm('');
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      >
                        {productTitle(p)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mb-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Orçamento diário (R$)
              </span>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Países (ex.: BR,PT)</span>
              <Input value={countries} onChange={(e) => setCountries(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Idade mín.</span>
              <Input
                type="number"
                min={13}
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Idade máx.</span>
              <Input
                type="number"
                min={13}
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
              />
            </label>
          </div>

          <Button
            size="sm"
            disabled={!name.trim() || !selected || !dailyBudget}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus size={15} /> Criar campanha (nasce pausada)
          </Button>
        </>
      )}
    </Card>
  );
}
