'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/* ── Button ──────────────────────────────────────────────── */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:brightness-110 shadow-soft',
        ghost: 'hover:bg-surface-2 text-fg',
        outline: 'border border-border hover:bg-surface-2',
        danger: 'bg-danger text-white hover:brightness-110',
      },
      size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

/* ── Card ────────────────────────────────────────────────── */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-5', className)} {...props} />;
}

/* ── Badge / StatusPill ──────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  uploaded: 'bg-muted/15 text-muted',
  processing: 'bg-primary/15 text-primary',
  needs_review: 'bg-warning/15 text-warning',
  ready: 'bg-primary/15 text-primary',
  published: 'bg-success/15 text-success',
  hidden: 'bg-muted/15 text-muted',
  draft: 'bg-muted/15 text-muted',
  error: 'bg-danger/15 text-danger',
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Enviado',
  processing: 'Processando',
  needs_review: 'Revisar',
  ready: 'Pronto',
  published: 'Publicado',
  hidden: 'Oculto',
  draft: 'Rascunho',
  error: 'Erro',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-muted/15 text-muted',
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40',
        className,
      )}
      {...props}
    />
  );
}
