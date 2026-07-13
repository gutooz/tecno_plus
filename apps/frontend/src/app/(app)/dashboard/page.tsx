'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, CheckCircle2, Clock, AlertTriangle, Eye, Timer, Cpu } from 'lucide-react';
import { api } from '@/lib/api';
import { DEMO_DASHBOARD } from '@/lib/demo-data';
import { Card } from '@/components/ui';

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
  demo?: boolean;
}

const CARDS = [
  { key: 'processed', label: 'Processados', icon: Package, color: 'text-primary' },
  { key: 'published', label: 'Publicados', icon: CheckCircle2, color: 'text-success' },
  { key: 'waiting', label: 'Aguardando', icon: Clock, color: 'text-warning' },
  { key: 'reviewing', label: 'Revisando', icon: Eye, color: 'text-primary' },
  { key: 'error', label: 'Com erro', icon: AlertTriangle, color: 'text-danger' },
] as const;

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      try {
        return await api.get<Dashboard>('/dashboard');
      } catch {
        return { ...(DEMO_DASHBOARD as Dashboard), demo: true };
      }
    },
    refetchInterval: 5000,
  });

  return (
    <div className="mx-auto max-w-6xl">
      {data?.demo && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          Modo demonstração (offline) — dados do lote Brás (11 produtos). Suba o backend + MongoDB
          para métricas ao vivo.
        </div>
      )}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted">Visão geral do catálogo em tempo real</p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon, color }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card className="flex flex-col gap-2">
              <Icon size={20} className={color} />
              <p className="text-2xl font-semibold tabular-nums">
                {isLoading ? '—' : (data?.products[key] ?? 0)}
              </p>
              <p className="text-xs text-muted">{label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Cpu size={20} />
          </div>
          <div>
            <p className="text-sm text-muted">IA em execução</p>
            <p className="text-xl font-semibold">{data?.aiRunning ?? 0} jobs</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Timer size={20} />
          </div>
          <div>
            <p className="text-sm text-muted">Tempo médio por agente</p>
            <p className="text-xl font-semibold">
              {((data?.averageAgentDurationMs ?? 0) / 1000).toFixed(1)}s
            </p>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <p className="mb-3 text-sm font-medium">Filas</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(data?.queues ?? []).map((q) => (
            <div key={q.queue} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs uppercase tracking-wide text-muted">{q.queue}</p>
              <p className="mt-1 text-sm">
                <span className="text-primary">{q.active}</span> ativo ·{' '}
                <span className="text-warning">{q.waiting}</span> espera
                {q.failed ? <span className="text-danger"> · {q.failed} falha</span> : null}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
