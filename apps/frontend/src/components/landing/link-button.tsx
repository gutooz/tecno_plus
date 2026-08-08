import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Link estilizado como o Button de ui.tsx (mesmo cva/tokens), para CTAs de
 * navegação onde um <button> não é semanticamente correto.
 */
const linkButtonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 ease-out-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-soft hover:shadow-md hover:brightness-[1.06]',
        ghost: 'text-fg hover:bg-surface-2',
        outline:
          'border border-border bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-border-strong',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

interface LinkButtonProps
  extends ComponentProps<typeof Link>, VariantProps<typeof linkButtonVariants> {}

export function LinkButton({ className, variant, size, ...props }: LinkButtonProps) {
  return <Link className={cn(linkButtonVariants({ variant, size }), className)} {...props} />;
}
