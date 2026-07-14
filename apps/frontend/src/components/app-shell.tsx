'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  UploadCloud,
  Layers,
  Package,
  Settings,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: UploadCloud },
  { href: '/lote', label: 'Envio em Lote', icon: Layers },
  { href: '/products', label: 'Produtos', icon: Package },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const logout = () => {
    clearToken();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Topo mobile: logo + tema + sair (a sidebar fica escondida abaixo de md) */}
      <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 overflow-hidden rounded-lg shadow-soft">
            <Image
              src="/logo.jpg"
              alt="Tecno Plus"
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-sm font-semibold">Tecno Plus</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2"
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={logout}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar desktop/tablet */}
      <aside className="glass sticky top-0 hidden h-screen w-64 flex-col gap-1 p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="h-9 w-9 overflow-hidden rounded-xl shadow-soft">
            <Image
              src="/logo.jpg"
              alt="Tecno Plus"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Tecno Plus</p>
            <p className="text-xs text-muted">AI Catalog</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  active ? 'text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-desktop"
                    className="absolute inset-0 rounded-xl bg-primary/10"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={18} className="relative z-10" />
                <span className="relative z-10 font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2"
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>

      {/* Nav inferior mobile */}
      <nav className="glass fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] transition',
                active ? 'text-primary' : 'text-muted',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active-mobile"
                  className="absolute inset-x-2 top-0.5 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon size={19} />
              <span className="truncate font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
