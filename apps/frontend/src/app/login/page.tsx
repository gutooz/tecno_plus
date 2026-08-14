'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Lock, Mail, Sparkles, Store, Truck, Zap } from 'lucide-react';
import {
  api,
  getToken,
  setRefreshToken,
  setSessionUser,
  setToken,
  type SessionUser,
} from '@/lib/api';
import { Button, Checkbox, Input } from '@/components/ui';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
type ProfileType = 'supplier' | 'seller';

const HIGHLIGHTS = [
  { icon: Zap, value: '10x mais rápido', label: 'Do upload à publicação' },
  { icon: Sparkles, value: '+2.400 produtos', label: 'Catalogados com IA' },
];

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get('resetToken') ?? '';
  const [mode, setMode] = useState<Mode>(
    resetToken ? 'reset' : searchParams.get('mode') === 'register' ? 'register' : 'login',
  );
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [profileType, setProfileType] = useState<ProfileType>('seller');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;

  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    if (resetToken) setMode('reset');
  }, [resetToken]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: mode !== 'reset', password: mode !== 'forgot' });
    if (mode !== 'reset' && !emailValid) return;
    if (mode !== 'forgot' && !passwordValid) return;

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (mode === 'forgot') {
        const res = await api.post<{ message: string }>('/auth/forgot-password', { email });
        setSuccess(res.message);
        return;
      }

      const res = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: SessionUser;
      }>(
        mode === 'reset' ? '/auth/reset-password' : `/auth/${mode}`,
        mode === 'reset'
          ? { token: resetToken, password }
          : {
              email,
              name,
              password,
              profileType: mode === 'register' ? profileType : undefined,
            },
      );
      setToken(res.accessToken, remember);
      setRefreshToken(res.refreshToken, remember);
      setSessionUser(res.user, remember);
      router.push(res.user.role === 'supplier' ? '/supplier' : '/seller');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar');
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
    setSuccess('');
    setTouched({});
  }

  function titleForMode() {
    if (mode === 'register') return 'Crie sua conta';
    if (mode === 'forgot') return 'Recuperar senha';
    if (mode === 'reset') return 'Criar nova senha';
    return 'Bem-vindo de volta';
  }

  function subtitleForMode() {
    if (mode === 'register') return 'Comece a catalogar em minutos';
    if (mode === 'forgot') return 'Receba um link seguro no seu e-mail';
    if (mode === 'reset') return 'Defina uma senha nova para entrar';
    return 'Entre para continuar';
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Painel institucional — sóbrio, sem neon */}
      <div className="relative hidden overflow-hidden bg-[#0b0f16] p-12 text-white lg:flex lg:w-[45%] lg:flex-col lg:justify-between">
        {/* Realce único, muito suave (nada de brilhos saturados) */}
        <div className="pointer-events-none absolute -left-32 -top-24 h-96 w-96 rounded-full bg-primary/15 blur-[120px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 flex items-center gap-3"
        >
          <div className="h-9 w-9 overflow-hidden rounded-2xl ring-1 ring-white/15">
            <Image
              src="/logo.jpg"
              alt="Tecno Plus"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-sm font-medium text-white/75">Tecno Plus AI Catalog</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative z-10 flex flex-col items-center gap-6 text-center"
        >
          <div className="h-36 w-36 overflow-hidden rounded-[2rem] shadow-glass ring-1 ring-white/10">
            <Image
              src="/logo.jpg"
              alt=""
              width={144}
              height={144}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="space-y-2.5">
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight">
              Catalogar produtos nunca foi tão rápido
            </h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-white/55">
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
              className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                <Icon size={16} />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{value}</p>
                <p className="text-xs text-white/45">{label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Formulário */}
      <div className="flex w-full flex-1 items-center justify-center p-6 lg:w-[55%]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
              <h1 className="text-xl font-semibold tracking-tight">{titleForMode()}</h1>
              <p className="mt-1 text-sm text-muted">{subtitleForMode()}</p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === 'register' && (
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setProfileType('seller')}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    profileType === 'seller'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-muted hover:bg-surface-2'
                  }`}
                >
                  <Store size={16} />
                  Quero criar uma loja como vendedor
                </button>
                <button
                  type="button"
                  onClick={() => setProfileType('supplier')}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    profileType === 'supplier'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-muted hover:bg-surface-2'
                  }`}
                >
                  <Truck size={16} />
                  Quero vender produtos como fornecedor
                </button>
                <Input
                  id="name"
                  placeholder="Nome do responsável"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="h-12"
                />
              </div>
            )}

            {mode !== 'reset' && (
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
            )}
            {mode !== 'forgot' && (
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
            )}

            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-muted">
                  <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Lembrar de mim
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setSuccess('');
                    setTouched({});
                  }}
                  className="text-primary transition hover:text-primary/80"
                >
                  Esqueceu sua senha?
                </button>
              </div>
            )}

            <AnimatePresence initial={false}>
              {success && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary"
                >
                  {success}
                </motion.div>
              )}
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

            <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
              {loading
                ? 'Aguarde...'
                : mode === 'register'
                  ? 'Cadastrar'
                  : mode === 'forgot'
                    ? 'Enviar link'
                    : mode === 'reset'
                      ? 'Salvar nova senha'
                      : 'Entrar'}
            </Button>
          </form>

          <button
            onClick={() => {
              if (mode === 'forgot' || mode === 'reset') {
                setMode('login');
                setError('');
                setSuccess('');
                setTouched({});
                return;
              }
              toggleMode();
            }}
            className="mt-6 w-full text-center text-sm text-muted transition hover:text-fg"
          >
            {mode === 'login' ? 'Nao tem conta? ' : mode === 'register' ? 'Ja tem conta? ' : ''}
            <span className="font-medium text-primary">
              {mode === 'login'
                ? 'Cadastre-se'
                : mode === 'register'
                  ? 'Entrar'
                  : 'Voltar ao login'}
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
