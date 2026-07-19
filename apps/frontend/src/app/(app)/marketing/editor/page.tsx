'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PenSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { MarketingNav } from '@/components/marketing-nav';

interface TrendItem {
  id: string;
  title: string;
}

const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'google_business', label: 'Google Meu Negócio' },
];

const TYPES = [
  { value: 'feed', label: 'Feed' },
  { value: 'story', label: 'Story' },
  { value: 'reel', label: 'Reel' },
  { value: 'carousel', label: 'Carrossel' },
  { value: 'offer', label: 'Oferta' },
];

const THEMES = [
  { value: 'promotional', label: 'Promocional' },
  { value: 'educational', label: 'Educativo' },
  { value: 'curiosity', label: 'Curiosidade' },
  { value: 'comparison', label: 'Comparativo' },
  { value: 'new_arrival', label: 'Novidade' },
  { value: 'review', label: 'Review' },
  { value: 'unboxing', label: 'Unboxing' },
  { value: 'behind_the_scenes', label: 'Bastidores' },
  { value: 'testimonial', label: 'Depoimento' },
  { value: 'seasonal', label: 'Data comemorativa' },
];

const CAMPAIGN_TYPES = [
  { value: 'launch', label: 'Lançamento' },
  { value: 'promotional', label: 'Promocional' },
  { value: 'clearance', label: 'Queima de estoque' },
  { value: 'coupon', label: 'Cupom' },
  { value: 'free_shipping', label: 'Frete grátis' },
  { value: 'flash_sale', label: 'Oferta relâmpago' },
  { value: 'bundle', label: 'Combo' },
  { value: 'black_friday', label: 'Black Friday' },
  { value: 'seasonal', label: 'Data comemorativa' },
];

const selectClass =
  'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary';

function defaultDateTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function MarketingEditorPage() {
  const router = useRouter();
  const { data: trends } = useQuery({
    queryKey: ['marketing', 'trends'],
    queryFn: () => api.get<TrendItem[]>('/marketing/trends'),
  });

  const [productId, setProductId] = useState('');
  const [channel, setChannel] = useState('instagram');
  const [type, setType] = useState('feed');
  const [theme, setTheme] = useState('promotional');
  const [campaignType, setCampaignType] = useState('promotional');
  const [scheduledFor, setScheduledFor] = useState(defaultDateTime);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/marketing/posts', {
        productId,
        channel,
        type,
        theme,
        campaignType,
        scheduledFor: new Date(scheduledFor).toISOString(),
      }),
    onSuccess: (res) => {
      router.push(`/marketing/compose/${productId}?postId=${res.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Marketing IA"
        subtitle="Editor manual — criar um post do zero, fora do calendário automático"
      />
      <MarketingNav />

      <Card className="flex flex-col gap-4">
        <p className="flex items-center gap-2 font-medium">
          <PenSquare size={16} className="text-primary" /> Novo post
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Produto</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={selectClass}
          >
            <option value="" disabled>
              Selecione um produto analisado
            </option>
            {(trends ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {trends && trends.length === 0 && (
            <p className="mt-1.5 text-xs text-warning">
              Nenhum produto analisado ainda — rode a análise de tendências primeiro.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Canal</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={selectClass}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Formato</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Tema</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className={selectClass}
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Campanha</label>
            <select
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
              className={selectClass}
            >
              {CAMPAIGN_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Data e hora</label>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className={selectClass}
          />
        </div>

        {create.isError && (
          <p className="text-sm text-danger">
            {create.error instanceof Error ? create.error.message : 'Falha ao criar o post.'}
          </p>
        )}

        <Button disabled={!productId} loading={create.isPending} onClick={() => create.mutate()}>
          Criar post e gerar conteúdo
        </Button>
      </Card>
    </div>
  );
}
