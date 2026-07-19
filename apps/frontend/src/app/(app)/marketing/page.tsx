'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Package,
  Megaphone,
  CalendarDays,
  Clapperboard,
  Film,
  Send,
  Clock3,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { MarketingNav } from '@/components/marketing-nav';
import { staggerContainer, staggerItem } from '@/lib/motion';

interface MarketingDashboard {
  productsAnalyzed: number;
  campaignsCreated: number;
  postsThisWeek: number;
  postsThisMonth: number;
  reels: number;
  stories: number;
  videos: number;
  published: number;
  scheduled: number;
}

type CardKey = keyof MarketingDashboard;

const CARDS: { key: CardKey; label: string; icon: LucideIcon; tint: string; iconColor: string }[] =
  [
    {
      key: 'productsAnalyzed',
      label: 'Produtos analisados',
      icon: Package,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      key: 'campaignsCreated',
      label: 'Campanhas criadas',
      icon: Megaphone,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      key: 'postsThisWeek',
      label: 'Posts da semana',
      icon: CalendarDays,
      tint: 'bg-success/12',
      iconColor: 'text-success',
    },
    {
      key: 'postsThisMonth',
      label: 'Posts do mês',
      icon: CalendarDays,
      tint: 'bg-success/12',
      iconColor: 'text-success',
    },
    {
      key: 'reels',
      label: 'Reels',
      icon: Clapperboard,
      tint: 'bg-warning/14',
      iconColor: 'text-warning',
    },
    {
      key: 'stories',
      label: 'Stories',
      icon: Film,
      tint: 'bg-warning/14',
      iconColor: 'text-warning',
    },
    {
      key: 'published',
      label: 'Posts publicados',
      icon: Send,
      tint: 'bg-success/12',
      iconColor: 'text-success',
    },
    {
      key: 'scheduled',
      label: 'Posts agendados',
      icon: Clock3,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
    },
  ];

export default function MarketingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'dashboard'],
    queryFn: () => api.get<MarketingDashboard>('/marketing/dashboard'),
    refetchInterval: 15000,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Marketing IA"
        subtitle="Departamento de marketing automatizado — tendências, campanhas e publicações geradas pela IA"
      />

      <MarketingNav />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3.5 sm:grid-cols-4"
      >
        {CARDS.map(({ key, label, icon: Icon, tint, iconColor }) => (
          <motion.div key={key} variants={staggerItem}>
            <Card interactive className="flex flex-col gap-3.5">
              <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tint}`}>
                <Icon size={19} className={iconColor} />
              </span>
              <div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 rounded-lg" />
                ) : (
                  <p className="nums text-[28px] font-semibold leading-none tracking-tight">
                    {data?.[key] ?? 0}
                  </p>
                )}
                <p className="mt-1.5 text-xs font-medium text-muted">{label}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Card className="mt-3.5">
        <p className="mb-1.5 text-sm font-semibold">Em construção</p>
        <p className="text-sm text-muted">
          O Trend Hunter já calcula o potencial de venda dos produtos prontos — veja em{' '}
          <span className="font-medium text-fg">Tendências</span>. O{' '}
          <span className="font-medium text-fg">Calendário</span> já gera posts automaticamente com
          legenda por IA. A publicação automática de verdade e os relatórios de analytics chegam nas
          próximas fases. Os números acima já refletem dados reais do catálogo — sem produto
          fictício.
        </p>
      </Card>
    </div>
  );
}
