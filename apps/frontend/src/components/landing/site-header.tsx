'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui';
import { LinkButton } from './link-button';

const NAV_LINKS = [
  { href: '#produto', label: 'Produto' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#fornecedores', label: 'Para fornecedores' },
  { href: '#vendedores', label: 'Para vendedores' },
  { href: '#integracoes', label: 'Integrações' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="glass sticky top-0 z-40 border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="#produto" className="flex items-center gap-2.5">
          <span className="h-9 w-9 overflow-hidden rounded-2xl shadow-soft ring-1 ring-border/60">
            <Image
              src="/logo.jpg"
              alt="zycron"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-sm font-semibold tracking-tight text-fg">zycron</span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted transition-colors duration-200 ease-out-soft hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LinkButton href="/login" variant="ghost" size="sm">
            Entrar
          </LinkButton>
          <LinkButton href="/login?mode=register" size="sm">
            Criar conta R$ 20
          </LinkButton>
        </div>

        <IconButton
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          className="lg:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </IconButton>
      </div>

      <div
        className={cn('overflow-hidden lg:hidden', open ? 'max-h-96' : 'max-h-0')}
        style={{ transition: 'max-height 250ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <nav className="flex flex-col gap-1 border-t border-border/70 px-4 py-3">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-2xl px-3 py-2.5 text-sm text-muted transition-colors duration-200 ease-out-soft hover:bg-surface-2 hover:text-fg"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-border/70 pt-3">
            <LinkButton href="/login" variant="outline" className="w-full">
              Entrar
            </LinkButton>
            <LinkButton href="/login?mode=register" className="w-full">
              Criar conta R$ 20
            </LinkButton>
          </div>
        </nav>
      </div>
    </header>
  );
}
