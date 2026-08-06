'use client';

import { Users } from 'lucide-react';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';

export default function SupplierSellersPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Vendedores" subtitle="Vendedores vinculados aos seus produtos" />
      <Card className="flex items-center gap-3 text-sm text-muted">
        <Users size={18} className="text-primary" />A vinculação aparece quando um vendedor importa
        um produto e cria o anúncio.
      </Card>
    </div>
  );
}
