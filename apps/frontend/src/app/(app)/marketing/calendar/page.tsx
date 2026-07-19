'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Sparkles, X, Trash2, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { MarketingNav } from '@/components/marketing-nav';
import { cn } from '@/lib/utils';

interface CalendarPost {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string;
  channel: string;
  type: string;
  theme: string;
  campaignType: string;
  status: string;
  scheduledFor: string;
  content: { caption: string; hashtags: string[]; cta: string; mediaUrls: string[] };
  trendScore: number;
  lastError?: string;
}

const TYPE_LABEL: Record<string, string> = {
  feed: 'Feed',
  story: 'Story',
  reel: 'Reel',
  carousel: 'Carrossel',
  offer: 'Oferta',
};
const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube_shorts: 'YouTube Shorts',
  pinterest: 'Pinterest',
  google_business: 'Google Meu Negócio',
};
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted/12 text-muted',
  scheduled: 'bg-primary/12 text-primary',
  published: 'bg-success/14 text-success',
  canceled: 'bg-danger/12 text-danger',
  failed: 'bg-danger/12 text-danger',
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function MarketingCalendarPage() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [duplicateDate, setDuplicateDate] = useState('');

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [weekStart]);

  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'calendar', fmtISODate(weekStart)],
    queryFn: () =>
      api.get<CalendarPost[]>(
        `/marketing/calendar?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`,
      ),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ created: number }>('/marketing/calendar/generate', {
        days: 7,
        startDate: weekStart.toISOString(),
      }),
    onSuccess: () => {
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ['marketing', 'calendar'] }),
        4000,
      );
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/marketing/calendar/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'calendar'] });
      setSelected(null);
    },
  });

  const saveContent = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/marketing/calendar/${id}/content`, { caption: captionDraft }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'calendar'] }),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) =>
      api.post(`/marketing/calendar/${id}/duplicate`, {
        scheduledFor: new Date(duplicateDate).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'calendar'] });
      setSelected(null);
    },
  });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of data ?? []) {
      const key = post.scheduledFor.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [data]);

  function openPost(post: CalendarPost) {
    setSelected(post);
    setCaptionDraft(post.content.caption);
    const d = new Date(post.scheduledFor);
    d.setDate(d.getDate() + 1);
    setDuplicateDate(d.toISOString().slice(0, 16));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Marketing IA" subtitle="Calendário de conteúdo gerado automaticamente">
        <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          Hoje
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setWeekStart((w) => {
              const d = new Date(w);
              d.setDate(d.getDate() - 7);
              return d;
            })
          }
        >
          <ChevronLeft size={15} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setWeekStart((w) => {
              const d = new Date(w);
              d.setDate(d.getDate() + 7);
              return d;
            })
          }
        >
          <ChevronRight size={15} />
        </Button>
        <Button size="sm" loading={generate.isPending} onClick={() => generate.mutate()}>
          <Sparkles size={15} /> Gerar calendário (7 dias)
        </Button>
      </PageHeader>

      <MarketingNav />

      {generate.isSuccess && (
        <Card className="mb-4 flex items-center gap-2 bg-primary/5 text-sm text-primary">
          <Sparkles size={15} />
          {generate.data.created} post(s) criado(s) — as legendas terminam de ser geradas em segundo
          plano.
        </Card>
      )}
      {generate.isError && (
        <Card className="mb-4 text-sm text-danger">
          {generate.error instanceof Error ? generate.error.message : 'Falha ao gerar calendário.'}
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {days.map((day) => {
            const key = fmtISODate(day);
            const posts = (postsByDay.get(key) ?? []).sort((a, b) =>
              a.scheduledFor.localeCompare(b.scheduledFor),
            );
            const isToday = key === fmtISODate(new Date());
            return (
              <Card
                key={key}
                className={cn(
                  'flex min-h-[220px] flex-col gap-2 p-3',
                  isToday && 'ring-1 ring-primary/40',
                )}
              >
                <p
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    isToday ? 'text-primary' : 'text-faint',
                  )}
                >
                  {WEEKDAYS[day.getDay()]} · {day.getDate()}/{day.getMonth() + 1}
                </p>
                <div className="flex flex-1 flex-col gap-1.5">
                  {posts.map((post) => (
                    <button
                      key={post.id}
                      onClick={() => openPost(post)}
                      className={cn(
                        'rounded-lg border border-border/70 bg-surface-2/60 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-2',
                        post.status === 'canceled' && 'opacity-50 line-through',
                      )}
                    >
                      <span
                        className={cn(
                          'mb-1 inline-block rounded-full px-1.5 py-0.5 font-medium',
                          STATUS_TONE[post.status],
                        )}
                      >
                        {new Date(post.scheduledFor).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {TYPE_LABEL[post.type] ?? post.type}
                      </span>
                      <p className="truncate font-medium text-fg">{post.productTitle}</p>
                      <p className="truncate text-muted">
                        {CHANNEL_LABEL[post.channel] ?? post.channel}
                      </p>
                    </button>
                  ))}
                  {posts.length === 0 && <p className="text-[11px] text-faint">Sem posts</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <Card className="mt-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{selected.productTitle}</p>
              <p className="text-xs text-muted">
                {CHANNEL_LABEL[selected.channel] ?? selected.channel} ·{' '}
                {TYPE_LABEL[selected.type] ?? selected.type} ·{' '}
                {new Date(selected.scheduledFor).toLocaleString('pt-BR')}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-fg">
              <X size={18} />
            </button>
          </div>

          {selected.lastError && (
            <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {selected.lastError}
            </p>
          )}

          <textarea
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary"
          />
          {selected.content.hashtags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {selected.content.hashtags.map((h) => (
                <span
                  key={h}
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                >
                  #{h}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              loading={saveContent.isPending}
              onClick={() => saveContent.mutate(selected.id)}
            >
              Salvar legenda
            </Button>
            <input
              type="datetime-local"
              value={duplicateDate}
              onChange={(e) => setDuplicateDate(e.target.value)}
              className="h-9 rounded-xl border border-border bg-surface px-2 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              loading={duplicate.isPending}
              onClick={() => duplicate.mutate(selected.id)}
            >
              <Copy size={14} /> Duplicar
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(selected.id)}
            >
              <Trash2 size={14} /> Cancelar post
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
