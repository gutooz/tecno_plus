'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Timer,
  Cpu,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { staggerContainer, staggerItem } from '@/lib/motion';

interface Dashboard {
  products: {
    processed: number;
    published: number;
    waiting: number;
    error: number;
    reviewing: number;
  };
  averageAgentDurationMs: number;
  aiRunning: number;
  queues: { queue: string; waiting: number; active: number; failed: number }[];
}

type CardKey = keyof Dashboard['products'];

const CARDS: { key: CardKey; label: string; icon: LucideIcon; tint: string; iconColor: string }[] =
  [
    {
      key: 'processed',
      label: 'Processados',
      icon: Package,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      key: 'published',
      label: 'Publicados',
      icon: CheckCircle2,
      tint: 'bg-success/12',
      iconColor: 'text-success',
    },
    {
      key: 'waiting',
      label: 'Aguardando',
      icon: Clock,
      tint: 'bg-warning/14',
      iconColor: 'text-warning',
    },
    {
      key: 'reviewing',
      label: 'Revisando',
      icon: Eye,
      tint: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      key: 'error',
      label: 'Com erro',
      icon: AlertTriangle,
      tint: 'bg-danger/12',
      iconColor: 'text-danger',
    },
  ];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    refetchInterval: 5000,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Dashboard" subtitle="Visão geral do catálogo em tempo real" />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5"
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
                    {data?.products[key] ?? 0}
                  </p>
                )}
                <p className="mt-1.5 text-xs font-medium text-muted">{label}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
        <InfoTile
          icon={Cpu}
          label="IA em execução"
          value={`${data?.aiRunning ?? 0} jobs`}
          loading={isLoading}
        />
        <InfoTile
          icon={Timer}
          label="Tempo médio por agente"
          value={`${((data?.averageAgentDurationMs ?? 0) / 1000).toFixed(1)}s`}
          loading={isLoading}
        />
      </div>

      <Card className="mt-3.5">
        <p className="mb-4 text-sm font-semibold">Filas de processamento</p>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : (data?.queues ?? []).length === 0 ? (
          <p className="py-4 text-sm text-muted">Nenhuma fila ativa no momento.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(data?.queues ?? []).map((q) => (
              <div
                key={q.queue}
                className="rounded-2xl border border-border/70 bg-surface-2/60 p-3.5"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  {q.queue}
                </p>
                <p className="nums mt-1.5 text-sm">
                  <span className="font-semibold text-primary">{q.active}</span>
                  <span className="text-muted"> ativo · </span>
                  <span className="font-semibold text-warning">{q.waiting}</span>
                  <span className="text-muted"> espera</span>
                  {q.failed ? <span className="text-danger"> · {q.failed} falha</span> : null}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon size={21} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-20 rounded-lg" />
        ) : (
          <p className="nums text-xl font-semibold tracking-tight">{value}</p>
        )}
      </div>
    </Card>
  );
}
