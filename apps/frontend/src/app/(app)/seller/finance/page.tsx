'use client';

import { CreditCard } from 'lucide-react';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

export default function SellerFinancePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Financeiro"
        subtitle="Custo do fornecedor, lucro bruto e taxas estimadas"
      />
      <Card className="flex items-center gap-3 text-sm text-muted">
        <CreditCard size={18} className="text-primary" />
        Os cálculos mostram previsão operacional; taxas de marketplace podem variar.
      </Card>
    </div>
  );
}
