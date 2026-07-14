'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg">
        <div className="h-9 w-9 animate-spin rounded-full border-[2.5px] border-border border-t-primary" />
        <p className="animate-fade-in text-sm text-faint">Carregando…</p>
      </div>
    );
  }

  return <>{children}</>;
}
