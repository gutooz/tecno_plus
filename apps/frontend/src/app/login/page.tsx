'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Lock, Mail, Sparkles, Zap } from 'lucide-react';
import { api, getToken, setToken } from '@/lib/api';
import { Button, Checkbox, Input, Spinner } from '@/components/ui';

type Mode = 'login' | 'register';

const HIGHLIGHTS = [
  { icon: Zap, value: '10x mais rápido', label: 'Do upload à publicação' },
  { icon: Sparkles, value: '+2.400 produtos', label: 'Catalogados com IA' },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;

  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!emailValid || !passwordValid) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ accessToken: string }>(`/auth/${mode}`, { email, password });
      setToken(res.accessToken, remember);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar');
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
    setTouched({});
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Institutional panel — hidden below lg, ~45% width above it */}
      <div className="relative hidden overflow-hidden bg-[#050b16] p-12 text-white lg:flex lg:w-[45%] lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/30 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-cyan-400/20 blur-[110px]" />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="h-9 w-9 overflow-hidden rounded-xl shadow-glass">
            <Image
              src="/logo.jpg"
              alt="Tecno Plus"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-sm font-medium text-white/80">Tecno Plus AI Catalog</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative z-10 flex flex-col items-center gap-6 text-center"
        >
          <div className="h-40 w-40 overflow-hidden rounded-[2rem] shadow-glass ring-1 ring-white/10">
            <Image
              src="/logo.jpg"
              alt=""
              width={160}
              height={160}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Catalogar produtos nunca foi tão rápido
            </h2>
            <p className="mx-auto max-w-sm text-sm text-white/60">
              Envie fotos, deixe a IA cuidar da ficha técnica e publique em minutos — tudo em um só
              lugar.
            </p>
          </div>
        </motion.div>

        <div className="relative z-10 flex flex-col gap-3 sm:flex-row">
          {HIGHLIGHTS.map(({ icon: Icon, value, label }, i) => (
            <motion.div
              key={value}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
              className="glass flex flex-1 items-center gap-3 rounded-2xl border-white/10 bg-white/5 p-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                <Icon size={16} />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{value}</p>
                <p className="text-xs text-white/50">{label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 items-center justify-center p-6 lg:w-[55%]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="card w-full max-w-sm p-8"
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 overflow-hidden rounded-2xl shadow-soft lg:hidden">
              <Image
                src="/logo.jpg"
                alt="Tecno Plus"
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold">
                {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {mode === 'login' ? 'Entre para continuar' : 'Comece a catalogar em minutos'}
              </p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Input
              id="email"
              type="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              leadingIcon={<Mail size={16} />}
              state={touched.email ? (emailValid ? 'success' : 'error') : 'default'}
              hint={touched.email && !emailValid ? 'Informe um e-mail válido' : undefined}
              autoComplete="email"
              required
              className="h-12"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              leadingIcon={<Lock size={16} />}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted transition hover:text-fg"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              state={touched.password && !passwordValid ? 'error' : 'default'}
              hint={
                touched.password && !passwordValid
                  ? 'A senha precisa ter ao menos 8 caracteres'
                  : undefined
              }
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              className="h-12"
            />

            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-muted">
                  <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Lembrar de mim
                </label>
                <button
                  type="button"
                  disabled
                  title="Em breve"
                  className="cursor-not-allowed text-muted/60"
                >
                  Esqueceu sua senha?
                </button>
              </div>
            )}

            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 overflow-hidden rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
                >
                  <AlertCircle size={15} className="shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full gap-2">
              {loading && <Spinner className="text-primary-fg" />}
              {loading ? 'Entrando…' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
            </Button>
          </form>

          <button
            onClick={toggleMode}
            className="mt-6 w-full text-center text-sm text-muted transition hover:text-fg"
          >
            {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
            <span className="font-medium text-primary">
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
