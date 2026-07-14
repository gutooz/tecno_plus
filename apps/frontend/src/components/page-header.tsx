import { type ReactNode } from 'react';

/**
 * Cabeçalho de página padrão: título + subtítulo à esquerda, ações à direita.
 * Reutilizado em todas as telas para ritmo e espaçamento consistentes.
 */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-[26px] font-semibold leading-none tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}
