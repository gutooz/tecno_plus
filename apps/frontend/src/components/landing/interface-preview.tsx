import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ICONS: LucideIcon[] = [LayoutDashboard, Package, ClipboardList, Boxes, Plug];

export interface PreviewKpi {
  label: string;
  value: string;
}

export interface PreviewRow {
  primary: string;
  secondary: string;
  tag: string;
  value: string;
  tone: 'success' | 'warning' | 'primary' | 'muted';
}

const TONE_DOT: Record<PreviewRow['tone'], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  primary: 'bg-primary',
  muted: 'bg-faint',
};

const TONE_TEXT: Record<PreviewRow['tone'], string> = {
  success: 'text-success',
  warning: 'text-warning',
  primary: 'text-primary',
  muted: 'text-muted',
};

interface InterfacePreviewProps {
  title: string;
  activeNavIndex?: number;
  kpis: PreviewKpi[];
  rows: PreviewRow[];
  className?: string;
}

export function InterfacePreview({
  title,
  activeNavIndex = 0,
  kpis,
  rows,
  className,
}: InterfacePreviewProps) {
  return (
    <div className={cn('card overflow-hidden p-0', className)} aria-hidden="true">
      {/* Barra superior */}
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
        <span className="text-xs font-medium text-muted">{title}</span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Sincronizado
        </span>
      </div>

      <div className="flex">
        {/* Trilho de navegação em miniatura */}
        <div className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border/70 py-4 sm:flex">
          {NAV_ICONS.map((Icon, i) => (
            <span
              key={i}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-2xl transition-colors duration-200 ease-out-soft',
                i === activeNavIndex ? 'bg-primary/10 text-primary' : 'text-faint',
              )}
            >
              <Icon size={14} />
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 p-5">
          {/* KPIs */}
          <div className="mb-4 grid grid-cols-3 gap-2.5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                <p className="nums text-sm font-semibold text-fg">{kpi.value}</p>
                <p className="truncate text-[10px] text-muted">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Linhas tipo tabela */}
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div
                key={row.primary}
                className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-3.5 py-2.5 text-xs"
              >
                <span className="h-7 w-7 shrink-0 rounded-xl bg-surface-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{row.primary}</p>
                  <p className="truncate text-muted">{row.secondary}</p>
                </div>
                <span
                  className={cn(
                    'hidden items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium sm:inline-flex',
                    TONE_TEXT[row.tone],
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[row.tone])} />
                  {row.tag}
                </span>
                <span className="nums whitespace-nowrap font-semibold text-fg">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
