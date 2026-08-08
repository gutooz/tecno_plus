import type { Metadata } from 'next';
import { SiteHeader } from '@/components/landing/site-header';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { ForSellers } from '@/components/landing/for-sellers';
import { ForSuppliers } from '@/components/landing/for-suppliers';
import { Integrations } from '@/components/landing/integrations';
import { SiteFooter } from '@/components/landing/site-footer';

export const metadata: Metadata = {
  title: 'Tecno Plus — Dropshipping entre fornecedores e vendedores',
  description:
    'A Tecno Plus conecta fornecedores e vendedores em uma única plataforma para cadastrar produtos, publicar em marketplaces, receber pedidos e organizar toda a operação de dropshipping.',
};

export default function Home() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <ForSellers />
        <ForSuppliers />
        <Integrations />
      </main>
      <SiteFooter />
    </div>
  );
}
