'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Eye,
  Radio,
  Brain,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { MarketingNav } from '@/components/marketing-nav';
import { staggerContainer, staggerItem } from '@/lib/motion';

interface AnalyticsSummary {
  hasData: boolean;
  totals: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    reach: number;
    impressions: number;
  };
  bestHour: number | null;
  bestType: string | null;
  bestTheme: string | null;
  posts: number;
}

interface Insight {
  id: string;
  summary: string;
  metric: string;
  confidence: number;
  sampleSize: number;
  createdAt: string;
}

type LearningResult =
  | { status: 'insufficient'; current: number; minRequired: number }
  | { status: 'ok'; insights: Insight[] };

const TYPE_LABEL: Record<string, string> = {
  feed: 'Feed',
  story: 'Story',
  reel: 'Reel',
  carousel: 'Carrossel',
  offer: 'Oferta',
};
const THEME_LABEL: Record<string, string> = {
  promotional: 'Promocional',
  educational: 'Educativo',
  curiosity: 'Curiosidade',
  comparison: 'Comparativo',
  new_arrival: 'Novidade',
  review: 'Review',
  unboxing: 'Unboxing',
  behind_the_scenes: 'Bastidores',
  testimonial: 'Depoimento',
  seasonal: 'Data comemorativa',
};

const TOTAL_TILES: {
  key: keyof AnalyticsSummary['totals'];
  label: string;
  icon: typeof Heart;
}[] = [
  { key: 'likes', label: 'Curtidas', icon: Heart },
  { key: 'comments', label: 'Comentários', icon: MessageCircle },
  { key: 'shares', label: 'Compartilhamentos', icon: Share2 },
  { key: 'saves', label: 'Salvamentos', icon: Bookmark },
  { key: 'reach', label: 'Alcance', icon: Radio },
  { key: 'impressions', label: 'Impressões', icon: Eye },
];

export default function MarketingAnalyticsPage() {
  const queryClient = useQueryClient();
  const [learningResult, setLearningResult] = useState<LearningResult | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'analytics'],
    queryFn: () => api.get<AnalyticsSummary>('/marketing/analytics'),
  });

  const { data: insights } = useQuery({
    queryKey: ['marketing', 'insights'],
    queryFn: () => api.get<Insight[]>('/marketing/insights'),
  });

  const sync = useMutation({
    mutationFn: () => api.post<{ synced: number; failed: number }>('/marketing/analytics/sync'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'analytics'] }),
  });

  const learning = useMutation({
    mutationFn: () => api.post<LearningResult>('/marketing/learning/run'),
    onSuccess: (res) => {
      setLearningResult(res);
      queryClient.invalidateQueries({ queryKey: ['marketing', 'insights'] });
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Marketing IA"
        subtitle="Analytics e aprendizado contínuo — dados reais dos posts publicados"
      >
        <Button size="sm" variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}>
          <RefreshCw size={15} /> Sincronizar analytics
        </Button>
        <Button size="sm" loading={learning.isPending} onClick={() => learning.mutate()}>
          <Brain size={15} /> Rodar Learning
        </Button>
      </PageHeader>

      <MarketingNav />

      {sync.isSuccess && (
        <Card className="mb-4 text-sm text-primary">
          {sync.data.synced} post(s) sincronizado(s)
          {sync.data.failed > 0 ? `, ${sync.data.failed} falha(s)` : ''}.
          {sync.data.synced === 0 && sync.data.failed === 0
            ? ' Nenhum post publicado de verdade ainda — publique um post para começar a coletar métricas.'
            : ''}
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : !data?.hasData ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <BarChart3 size={28} className="text-faint" />
          <div>
            <p className="font-medium">Nenhum post publicado ainda</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              O Analytics Agent coleta curtidas, comentários, alcance e impressões dos posts
              publicados de verdade no Facebook/Instagram. Publique um post no{' '}
              <span className="font-medium text-fg">Calendário</span> ou no{' '}
              <span className="font-medium text-fg">Editor Manual</span> e depois clique em
              &quot;Sincronizar analytics&quot;.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3.5 sm:grid-cols-3"
          >
            {TOTAL_TILES.map(({ key, label, icon: Icon }) => (
              <motion.div key={key} variants={staggerItem}>
                <Card className="flex flex-col gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="nums text-2xl font-semibold tracking-tight">
                      {data.totals[key].toLocaleString('pt-BR')}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted">{label}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <Card className="mt-3.5">
            <p className="mb-3 text-sm font-semibold">Melhor desempenho ({data.posts} post(s))</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Melhor horário
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {data.bestHour !== null ? `${String(data.bestHour).padStart(2, '0')}h` : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Melhor formato
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {data.bestType ? (TYPE_LABEL[data.bestType] ?? data.bestType) : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-surface-2/60 p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Melhor tema
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {data.bestTheme ? (THEME_LABEL[data.bestTheme] ?? data.bestTheme) : '—'}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-3.5">
        <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          <Brain size={15} className="text-primary" /> Aprendizado (Learning Agent)
        </p>

        {learningResult?.status === 'insufficient' && (
          <p className="text-sm text-muted">
            Dados insuficientes para gerar aprendizados confiáveis — {learningResult.current} de{' '}
            {learningResult.minRequired} posts publicados necessários. Continue publicando para
            desbloquear.
          </p>
        )}
        {learningResult?.status === 'ok' && learningResult.insights.length === 0 && (
          <p className="text-sm text-muted">
            Nenhum padrão claro encontrado nos dados ainda — o Learning Agent prefere não afirmar
            nada a forçar um achado sem base.
          </p>
        )}

        {(insights ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(insights ?? []).map((i) => (
              <li key={i.id} className="rounded-xl bg-surface-2/60 p-3 text-sm">
                <p>{i.summary}</p>
                <p className="mt-1 text-xs text-muted">
                  Confiança {(i.confidence * 100).toFixed(0)}% · amostra de {i.sampleSize} post(s)
                </p>
              </li>
            ))}
          </ul>
        ) : !learningResult ? (
          <p className="text-sm text-muted">
            Clique em &quot;Rodar Learning&quot; para o agente analisar os posts publicados e propor
            padrões (ex.: &quot;Reels às 19h engajam mais&quot;).
          </p>
        ) : null}
      </Card>
    </div>
  );
}
