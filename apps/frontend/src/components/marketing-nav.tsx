'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/marketing', label: 'Visão geral' },
  { href: '/marketing/trends', label: 'Tendências' },
  { href: '/marketing/calendar', label: 'Calendário' },
  { href: '/marketing/editor', label: 'Editor Manual' },
  { href: '/marketing/analytics', label: 'Analytics' },
];

/** Abas do departamento de Marketing IA — cresce conforme novas fases adicionam telas. */
export function MarketingNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-border/70">
      {TABS.map((tab) => {
        const active =
          tab.href === '/marketing' ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 ease-out-soft',
              active ? 'text-primary' : 'text-muted hover:text-fg',
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
