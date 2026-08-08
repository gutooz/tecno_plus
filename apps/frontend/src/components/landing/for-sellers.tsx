'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { InterfacePreview } from './interface-preview';
import { fadeUp } from '@/lib/motion';

const BENEFITS = [
  'Encontre fornecedores confiáveis em um catálogo único',
  'Escolha produtos e defina sua margem de lucro',
  'Publique nos marketplaces sem cadastrar tudo manualmente',
  'Acompanhe vendas, pedidos e lucro em tempo real',
];

export function ForSellers() {
  return (
    <section id="vendedores" className="scroll-mt-16 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
        >
          <p className="text-sm font-medium text-primary">Para vendedores</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Venda sem manter estoque próprio
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-sm text-fg">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check size={12} strokeWidth={3} />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
        >
          <InterfacePreview
            title="Meus produtos — Vendedor"
            activeNavIndex={1}
            kpis={[
              { label: 'Lucro estimado', value: 'R$ 4.120' },
              { label: 'Margem média', value: '32%' },
              { label: 'Anúncios ativos', value: '19' },
            ]}
            rows={[
              {
                primary: 'Kit Organizador de Cabos',
                secondary: 'Custo R$ 22,00 · Venda R$ 39,90',
                tag: 'Publicado',
                value: '+31%',
                tone: 'success',
              },
              {
                primary: 'Case Protetor Notebook',
                secondary: 'Custo R$ 45,00 · Venda R$ 74,90',
                tag: 'Publicado',
                value: '+28%',
                tone: 'success',
              },
              {
                primary: 'Mini Ventilador USB',
                secondary: 'Custo R$ 18,50 · Venda R$ 32,00',
                tag: 'Rascunho',
                value: '+27%',
                tone: 'muted',
              },
            ]}
          />
        </motion.div>
      </div>
    </section>
  );
}
