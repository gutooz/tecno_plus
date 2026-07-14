'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
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

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  state?: 'default' | 'error' | 'success';
  hint?: string;
}

const INPUT_STATE_RING: Record<NonNullable<InputProps['state']>, string> = {
  default: 'border-border focus:ring-primary/40',
  error: 'border-danger/60 focus:ring-danger/40',
  success: 'border-success/60 focus:ring-success/40',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leadingIcon, trailingIcon, state = 'default', hint, id, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={state === 'error' || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(
            'h-10 w-full rounded-xl border bg-surface text-sm outline-none transition-shadow duration-150 focus:ring-2',
            leadingIcon ? 'pl-10' : 'pl-3',
            trailingIcon ? 'pr-10' : 'pr-3',
            INPUT_STATE_RING[state],
            className,
          )}
          {...props}
        />
        {trailingIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {trailingIcon}
          </span>
        )}
      </div>
      {hint && (
        <p
          id={id ? `${id}-hint` : undefined}
          className={cn(
            'mt-1.5 text-xs',
            state === 'error' ? 'text-danger' : state === 'success' ? 'text-success' : 'text-muted',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  ),
);
Input.displayName = 'Input';

/* ── Checkbox ────────────────────────────────────────────── */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => (
  <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border border-border bg-surface transition checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
      {...props}
    />
    <Check
      size={13}
      strokeWidth={3}
      className="pointer-events-none absolute text-primary-fg opacity-0 transition-opacity peer-checked:opacity-100"
    />
  </span>
));
Checkbox.displayName = 'Checkbox';

/* ── Spinner ─────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
