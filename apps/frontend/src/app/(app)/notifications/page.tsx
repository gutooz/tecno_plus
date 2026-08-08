'use client';

import { Bell } from 'lucide-react';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Notificações" subtitle="Alertas de pedidos, estoque e integrações" />
      <Card className="flex items-center gap-3 text-sm text-muted">
        <Bell size={18} className="text-primary" />
        Novos pedidos e exceções já geram registros de notificação no backend.
      </Card>
    </div>
  );
}
