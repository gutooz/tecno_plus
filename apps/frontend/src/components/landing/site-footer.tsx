import Image from 'next/image';
import Link from 'next/link';

const LINKS = [
  { href: '/support', label: 'Suporte' },
  { href: '/privacy', label: 'Privacidade' },
  { href: '/terms', label: 'Termos de uso' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden rounded-2xl shadow-soft ring-1 ring-border/60">
            <Image
              src="/logo.jpg"
              alt="zycron"
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-sm text-muted">
            © {new Date().getFullYear()} zycron. Todos os direitos reservados.
          </span>
        </div>

        <nav className="flex items-center gap-6">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
