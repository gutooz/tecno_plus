'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { InterfacePreview } from './interface-preview';
import { LinkButton } from './link-button';

export function Hero() {
  return (
    <section id="produto" className="relative scroll-mt-16 overflow-hidden">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            Venda mais produtos sem precisar manter estoque próprio.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
            A Tecno Plus conecta fornecedores e vendedores em uma única plataforma para cadastrar
            produtos, publicar em marketplaces, receber pedidos e organizar toda a operação de
            dropshipping.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/login?mode=register" size="lg">
              Começar agora
              <ArrowRight size={16} />
            </LinkButton>
            <LinkButton href="#como-funciona" variant="outline" size="lg">
              Entender como funciona
            </LinkButton>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <InterfacePreview
            title="Visão geral — Vendedor"
            kpis={[
              { label: 'Faturamento no mês', value: 'R$ 18.240' },
              { label: 'Pedidos', value: '142' },
              { label: 'Produtos ativos', value: '37' },
            ]}
            rows={[
              {
                primary: 'Fone Bluetooth X200',
                secondary: 'Fornecedor Alpha Distribuidora · Shopee',
                tag: 'Enviado',
                value: 'R$ 89,90',
                tone: 'success',
              },
              {
                primary: 'Suporte de Celular Veicular',
                secondary: 'Fornecedor Nova Peças · Shopee',
                tag: 'Novo pedido',
                value: 'R$ 34,50',
                tone: 'primary',
              },
              {
                primary: 'Luminária de Mesa LED',
                secondary: 'Fornecedor Lumen Casa · Mercado Livre',
                tag: 'Aguardando',
                value: 'R$ 112,00',
                tone: 'warning',
              },
            ]}
          />
        </motion.div>
      </div>
    </section>
  );
}
