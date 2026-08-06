'use client';

import { CreditCard } from 'lucide-react';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

export default function SupplierFinancePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Financeiro"
        subtitle="Valores previstos e status de pagamento ao fornecedor"
      />
      <Card className="flex items-center gap-3 text-sm text-muted">
        <CreditCard size={18} className="text-primary" />O financeiro inicial é criado por pedido,
        sem split automático de pagamento.
      </Card>
    </div>
  );
}
