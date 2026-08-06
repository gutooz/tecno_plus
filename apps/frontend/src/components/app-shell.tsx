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
  Plug,
  Settings,
  Bell,
  Boxes,
  ClipboardList,
  CreditCard,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Moon,
  Sun,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearToken, getSessionUser } from '@/lib/api';
import { IconButton } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const LEGACY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: UploadCloud },
  { href: '/lote', label: 'Envio em Lote', icon: Layers },
  { href: '/products', label: 'Produtos', icon: Package },
  { href: '/integrations', label: 'Integrações', icon: Plug },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

const SUPPLIER_NAV: NavItem[] = [
  { href: '/supplier', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/supplier/products', label: 'Meus produtos', icon: Package },
  { href: '/supplier/stock', label: 'Estoque', icon: Boxes },
  { href: '/supplier/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/supplier/sellers', label: 'Vendedores', icon: Users },
  { href: '/supplier/finance', label: 'Financeiro', icon: CreditCard },
  { href: '/notifications', label: 'Notificações', icon: Bell },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

const SELLER_NAV: NavItem[] = [
  { href: '/seller', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/seller/catalog', label: 'Catálogo', icon: Store },
  { href: '/seller/listings', label: 'Meus produtos', icon: Package },
  { href: '/integrations', label: 'Minha loja Shopee', icon: Plug },
  { href: '/seller/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/seller/finance', label: 'Financeiro', icon: CreditCard },
  { href: '/notifications', label: 'Notificações', icon: Bell },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Admin', icon: ShieldCheck },
  { href: '/dashboard', label: 'Catálogo IA', icon: LayoutDashboard },
  { href: '/products', label: 'Produtos IA', icon: Package },
  { href: '/integrations', label: 'Integrações', icon: Plug },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

function navForRole(role?: string): NavItem[] {
  if (role === 'supplier') return SUPPLIER_NAV;
  if (role === 'seller') return SELLER_NAV;
  if (role === 'admin') return ADMIN_NAV;
  return LEGACY_NAV;
}

function Brand({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 32 : 38;
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="overflow-hidden rounded-2xl shadow-soft ring-1 ring-border/60"
        style={{ height: dim, width: dim }}
      >
        <Image
          src="/logo.jpg"
          alt="Tecno Plus"
          width={dim}
          height={dim}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight">Tecno Plus</p>
        {size === 'md' && <p className="text-[11px] font-medium text-faint">AI Catalog</p>}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const nav = navForRole(getSessionUser()?.role);

  const logout = () => {
    clearToken();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Topo mobile */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-3 md:hidden">
        <Brand size="sm" />
        <div className="flex items-center gap-1">
          <IconButton
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label="Alternar tema"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
          <IconButton onClick={logout} tone="danger" aria-label="Sair">
            <LogOut size={18} />
          </IconButton>
        </div>
      </header>

      {/* Sidebar desktop/tablet */}
      <aside className="glass sticky top-0 hidden h-screen w-64 flex-col gap-1 border-r border-border/70 p-4 md:flex">
        <div className="mb-7 px-2 pt-1">
          <Brand />
        </div>

        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
          Menu
        </p>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors duration-200 ease-out-soft',
                  active ? 'text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-desktop"
                    className="absolute inset-0 rounded-2xl bg-primary/10 ring-1 ring-inset ring-primary/15"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon
                  size={18}
                  className={cn(
                    'relative z-10 transition-transform duration-200 ease-out-soft',
                    !active && 'group-hover:scale-110',
                  )}
                />
                <span className="relative z-10 font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-surface-2/60 p-1.5">
          <button
            onClick={logout}
            className="flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition-colors duration-200 ease-out-soft hover:bg-surface hover:text-danger"
          >
            <LogOut size={16} /> Sair
          </button>
          <IconButton
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label="Alternar tema"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
        </div>
      </aside>

      {/* Conteúdo — transição suave a cada navegação */}
      <main className="flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </main>

      {/* Nav inferior mobile */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10px] transition-colors duration-200',
                active ? 'text-primary' : 'text-muted',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active-mobile"
                  className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <Icon size={19} className={cn(active && 'scale-105')} />
              <span className="truncate font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
