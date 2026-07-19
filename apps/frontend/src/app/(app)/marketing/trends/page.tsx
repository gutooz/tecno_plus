'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Calendar, RefreshCw, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { MarketingNav } from '@/components/marketing-nav';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface TrendItem {
  id: string;
  title: string;
  image: string;
  trend: {
    score: number;
    reasons: string[];
    seasonalEvent?: string;
    suggestedHashtags: string[];
    suggestedKeywords: string[];
  } | null;
  plan: {
    campaignType: string;
    objective: string;
    targetAudience: string;
    strategy: string;
    idealPostingHour: number;
  } | null;
}

const CAMPAIGN_LABEL: Record<string, string> = {
  launch: 'Lançamento',
  promotional: 'Promocional',
  clearance: 'Queima de estoque',
  coupon: 'Cupom',
  free_shipping: 'Frete grátis',
  flash_sale: 'Oferta relâmpago',
  bundle: 'Combo',
  black_friday: 'Black Friday',
  seasonal: 'Data comemorativa',
};

function scoreTone(score: number) {
  if (score >= 70) return 'text-success bg-success/12';
  if (score >= 40) return 'text-warning bg-warning/14';
  return 'text-muted bg-muted/12';
}

export default function MarketingTrendsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'trends'],
    queryFn: () => api.get<TrendItem[]>('/marketing/trends'),
  });

  const analyze = useMutation({
    mutationFn: (force: boolean) =>
      api.post<{ queued: number }>('/marketing/trends/analyze', { force }),
    onSuccess: (res) => {
      if (res.queued > 0) {
        setTimeout(
          () => queryClient.invalidateQueries({ queryKey: ['marketing', 'trends'] }),
          4000,
        );
      }
    },
  });

  const items = data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Marketing IA"
        subtitle="Produtos com maior potencial de venda, segundo o Trend Hunter"
      >
        <Button
          size="sm"
          variant="outline"
          loading={analyze.isPending}
          onClick={() => analyze.mutate(false)}
        >
          <RefreshCw size={15} /> Analisar novos produtos
        </Button>
      </PageHeader>

      <MarketingNav />

      {analyze.isSuccess && (
        <Card className="mb-4 flex items-center gap-2 bg-primary/5 text-sm text-primary">
          <Sparkles size={15} />
          {analyze.data.queued > 0
            ? `Analisando ${analyze.data.queued} produto(s) em segundo plano — a lista atualiza sozinha em alguns segundos.`
            : 'Nenhum produto novo para analisar (todos os produtos prontos já têm score de tendência).'}
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <TrendingUp size={28} className="text-faint" />
          <div>
            <p className="font-medium">Nenhum produto analisado ainda</p>
            <p className="mt-1 text-sm text-muted">
              Clique em &quot;Analisar novos produtos&quot; para o Trend Hunter calcular o score dos
              produtos prontos do catálogo.
            </p>
          </div>
        </Card>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid gap-3.5 sm:grid-cols-2"
        >
          {items.map((item) => (
            <motion.div key={item.id} variants={staggerItem}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate font-medium">{item.title}</p>
                  {item.trend && (
                    <span
                      className={cn(
                        'nums shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        scoreTone(item.trend.score),
                      )}
                    >
                      {item.trend.score}
                    </span>
                  )}
                </div>

                {item.trend?.seasonalEvent && (
                  <p className="flex items-center gap-1.5 text-xs text-primary">
                    <Calendar size={13} /> {item.trend.seasonalEvent}
                  </p>
                )}

                {item.trend?.reasons?.length ? (
                  <ul className="space-y-1 text-sm text-muted">
                    {item.trend.reasons.slice(0, 3).map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                ) : null}

                {item.trend?.suggestedHashtags?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.trend.suggestedHashtags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {item.plan && (
                  <div className="mt-1 border-t border-border/70 pt-3 text-xs">
                    <p className="font-medium text-fg">
                      {CAMPAIGN_LABEL[item.plan.campaignType] ?? item.plan.campaignType}
                      <span className="ml-2 font-normal text-muted">
                        · melhor horário {String(item.plan.idealPostingHour).padStart(2, '0')}h
                      </span>
                    </p>
                    <p className="mt-1 text-muted">{item.plan.objective}</p>
                  </div>
                )}

                <Link href={`/marketing/compose/${item.id}`} className="mt-1">
                  <Button size="sm" variant="outline" className="w-full">
                    <Wand2 size={14} /> Gerar conteúdo
                  </Button>
                </Link>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
