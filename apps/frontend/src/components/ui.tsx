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

/* ── Spinner ─────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* ── Button ──────────────────────────────────────────────── */
const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 ease-out-soft active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-soft hover:shadow-md hover:brightness-[1.06]',
        ghost: 'text-fg hover:bg-surface-2',
        outline:
          'border border-border bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-border-strong',
        subtle: 'bg-surface-2 text-fg hover:bg-surface-3',
        danger: 'bg-danger text-white shadow-soft hover:brightness-[1.06]',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* ── IconButton ──────────────────────────────────────────── */
const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-muted transition-colors duration-200 ease-out-soft hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      size: { sm: 'h-8 w-8', md: 'h-9 w-9' },
      tone: { default: '', danger: 'hover:text-danger', primary: 'hover:text-primary' },
    },
    defaultVariants: { size: 'md', tone: 'default' },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size, tone, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ size, tone }), className)}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';

/* ── Card ────────────────────────────────────────────────── */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}
export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'card p-5',
        interactive &&
          'cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
      {...props}
    />
  );
}

/* ── Skeleton ────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded-xl', className)} />;
}

/* ── StatusPill ──────────────────────────────────────────── */
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  uploaded: { pill: 'bg-muted/12 text-muted', dot: 'bg-muted' },
  processing: { pill: 'bg-primary/12 text-primary', dot: 'bg-primary animate-pulse' },
  needs_review: { pill: 'bg-warning/15 text-warning', dot: 'bg-warning' },
  ready: { pill: 'bg-primary/12 text-primary', dot: 'bg-primary' },
  published: { pill: 'bg-success/14 text-success', dot: 'bg-success' },
  hidden: { pill: 'bg-muted/12 text-muted', dot: 'bg-muted' },
  draft: { pill: 'bg-muted/12 text-muted', dot: 'bg-muted' },
  error: { pill: 'bg-danger/12 text-danger', dot: 'bg-danger' },
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
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        s.pill,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ── Input ───────────────────────────────────────────────── */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  state?: 'default' | 'error' | 'success';
  hint?: string;
}

const INPUT_STATE_RING: Record<NonNullable<InputProps['state']>, string> = {
  default: 'border-border focus:border-primary focus:ring-primary/15',
  error: 'border-danger/60 focus:border-danger focus:ring-danger/15',
  success: 'border-success/55 focus:border-success focus:ring-success/15',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leadingIcon, trailingIcon, state = 'default', hint, id, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={state === 'error' || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(
            'h-10 w-full rounded-xl border bg-surface text-sm text-fg outline-none transition-all duration-200 ease-out-soft placeholder:text-faint focus:ring-4',
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
        'peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[7px] border border-border-strong bg-surface transition-all duration-200 ease-out-soft checked:border-primary checked:bg-primary hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className,
      )}
      {...props}
    />
    <Check
      size={13}
      strokeWidth={3.5}
      className="pointer-events-none absolute scale-75 text-primary-fg opacity-0 transition-all duration-200 ease-out-soft peer-checked:scale-100 peer-checked:opacity-100"
    />
  </span>
));
Checkbox.displayName = 'Checkbox';
