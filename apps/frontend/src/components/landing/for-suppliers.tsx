'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { InterfacePreview } from './interface-preview';
import { fadeUp } from '@/lib/motion';

const BENEFITS = [
  'Cadastre produtos, estoque e preço uma única vez',
  'Alcance vendedores que publicam nos marketplaces por você',
  'Acompanhe pedidos recebidos e prazos de envio',
  'Veja quais vendedores estão comercializando cada produto',
];

export function ForSuppliers() {
  return (
    <section id="fornecedores" className="scroll-mt-16 bg-surface-2/50 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="order-2 lg:order-1"
        >
          <InterfacePreview
            title="Pedidos para processar — Fornecedor"
            activeNavIndex={2}
            kpis={[
              { label: 'Faturamento no mês', value: 'R$ 52.900' },
              { label: 'Vendedores ativos', value: '64' },
              { label: 'Estoque baixo', value: '3' },
            ]}
            rows={[
              {
                primary: 'Pedido #48213',
                secondary: 'Fone Bluetooth X200 · 2 un. · Vendedor Loja Prime',
                tag: 'Novo',
                value: 'Processar',
                tone: 'primary',
              },
              {
                primary: 'Pedido #48207',
                secondary: 'Suporte Veicular · 1 un. · Vendedor Casa Center',
                tag: 'Embalado',
                value: 'Enviar',
                tone: 'warning',
              },
              {
                primary: 'Pedido #48198',
                secondary: 'Luminária LED · 4 un. · Vendedor Boa Compra',
                tag: 'Enviado',
                value: 'Concluído',
                tone: 'success',
              },
            ]}
          />
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="order-1 lg:order-2"
        >
          <p className="text-sm font-medium text-primary">Para fornecedores</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Transforme seu catálogo em uma rede de vendedores
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
      </div>
    </section>
  );
}
