'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { staggerContainer, staggerItem } from '@/lib/motion';

interface Integration {
  name: string;
  description: string;
  available: boolean;
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'Shopee',
    description: 'Publique anúncios e receba pedidos direto da sua loja Shopee.',
    available: true,
  },
  {
    name: 'Mercado Livre',
    description: 'Conecte sua conta e sincronize catálogo e pedidos.',
    available: true,
  },
  {
    name: 'Amazon',
    description: 'Integração com o marketplace da Amazon.',
    available: false,
  },
  {
    name: 'TikTok Shop',
    description: 'Publicação de produtos direto no TikTok Shop.',
    available: false,
  },
];

export function Integrations() {
  return (
    <section id="integracoes" className="scroll-mt-16 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Integrações</h2>
          <p className="mt-3 text-base text-muted">
            Conecte os marketplaces onde seus produtos já são vendidos.
          </p>
        </div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {INTEGRATIONS.map((integration) => (
            <motion.div key={integration.name} variants={staggerItem}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{integration.name}</span>
                  <span
                    className={cn(
                      'whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                      integration.available
                        ? 'bg-success/14 text-success'
                        : 'bg-surface-3 text-muted',
                    )}
                  >
                    {integration.available ? 'Disponível' : 'Em breve'}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted">{integration.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
