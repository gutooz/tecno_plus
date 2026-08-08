'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui';
import { staggerContainer, staggerItem } from '@/lib/motion';

const STEPS = [
  {
    number: '01',
    title: 'Fornecedor cadastra o produto',
    description:
      'Produto, estoque, preço e informações comerciais ficam disponíveis dentro da plataforma.',
  },
  {
    number: '02',
    title: 'Vendedor seleciona o produto',
    description: 'O vendedor escolhe o produto no catálogo e define sua margem de lucro.',
  },
  {
    number: '03',
    title: 'Produto é publicado',
    description: 'A Tecno Plus conecta o catálogo do vendedor com o marketplace escolhido.',
  },
  {
    number: '04',
    title: 'Venda é recebida',
    description: 'O pedido chega ao sistema e o fornecedor recebe os dados para fazer o envio.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-16 bg-surface-2/50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Como funciona
          </h2>
          <p className="mt-3 text-base text-muted">
            Quatro etapas conectam o catálogo do fornecedor à venda no marketplace do vendedor.
          </p>
        </div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STEPS.map((step) => (
            <motion.div key={step.number} variants={staggerItem}>
              <Card className="h-full">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                  {step.number}
                </span>
                <h3 className="mt-4 text-base font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
