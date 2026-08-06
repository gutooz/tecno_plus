'use client';

import { Boxes } from 'lucide-react';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

export default function SupplierStockPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Estoque" subtitle="Histórico e filas de sincronização de estoque" />
      <Card className="flex items-center gap-3 text-sm text-muted">
        <Boxes size={18} className="text-primary" />
        Movimentações são registradas automaticamente ao cadastrar produto, atualizar estoque e
        receber pedidos.
      </Card>
    </div>
  );
}
