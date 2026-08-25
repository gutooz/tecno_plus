'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Mail,
  QrCode,
  RefreshCcw,
  Sparkles,
  Store,
  Zap,
} from 'lucide-react';
import {
  api,
  getToken,
  setRefreshToken,
  setSessionUser,
  setToken,
  type SessionUser,
} from '@/lib/api';
import { Button, Checkbox, Input } from '@/components/ui';

type Mode = 'login' | 'register';

type AuthSuccessResponse = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  paymentRequired?: false;
};

type SignupPaymentResponse = {
  paymentRequired: true;
  amount: number;
  status: string;
  paymentId: string;
  pix?: {
    encodedImage?: string;
    payload?: string;
    ticketUrl?: string;
  };
};

type AuthResponse = AuthSuccessResponse | SignupPaymentResponse;

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
  const [mode, setMode] = useState<Mode>(
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  );
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [error, setError] = useState('');
  const [paymentNotice, setPaymentNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [signupPayment, setSignupPayment] = useState<SignupPaymentResponse | null>(null);

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
    setPaymentNotice('');
    try {
      const res = await api.post<AuthResponse>(`/auth/${mode}`, {
        email,
        name,
        password,
        profileType: mode === 'register' ? 'seller' : undefined,
      });
      if (res.paymentRequired) {
        setSignupPayment(res);
        setPaymentNotice('Pix Mercado Pago gerado. Pague R$ 20 para liberar sua conta.');
        return;
      }
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
    setPaymentNotice('');
    setSignupPayment(null);
    setTouched({});
  }

  async function verifySignupPayment() {
    if (!signupPayment) return;
    setCheckingPayment(true);
    setError('');
    setPaymentNotice('');
    try {
      const res = await api.post<AuthResponse>('/auth/register/payment-status', {
        email,
        password,
        paymentId: signupPayment.paymentId,
      });
      if (res.paymentRequired) {
        setSignupPayment((current) => (current ? { ...current, status: res.status } : res));
        setPaymentNotice('Ainda aguardando confirmação do Mercado Pago.');
        return;
      }
      setToken(res.accessToken, remember);
      setRefreshToken(res.refreshToken, remember);
      setSessionUser(res.user, remember);
      router.push(res.user.role === 'supplier' ? '/supplier' : '/seller');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao verificar pagamento');
    } finally {
      setCheckingPayment(false);
    }
  }

  async function copyPixPayload() {
    const payload = signupPayment?.pix?.payload;
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    setPaymentNotice('Código Pix copiado.');
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
              alt="zycron"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-sm font-medium text-white/75">zycron</span>
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
                alt="zycron"
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {mode === 'login'
                  ? 'Entre para continuar'
                  : 'Pague R$ 20 via Mercado Pago para ativar'}
              </p>
            </div>
          </div>

          {signupPayment && (
            <div className="mb-5 rounded-2xl border border-border bg-surface-2/60 p-3">
              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                {signupPayment.pix?.encodedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${signupPayment.pix.encodedImage}`}
                    alt="QR Code Pix Mercado Pago"
                    className="h-28 w-28 rounded-xl bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-surface">
                    <QrCode size={28} className="text-muted" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">Cadastro R$ 20</p>
                    <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      {signupPayment.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Pague com Pix pelo Mercado Pago e clique em verificar para entrar.
                  </p>
                  {signupPayment.pix?.payload && (
                    <p className="mt-2 line-clamp-2 break-all text-xs text-muted">
                      {signupPayment.pix.payload}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {signupPayment.pix?.payload && (
                      <Button type="button" size="sm" variant="outline" onClick={copyPixPayload}>
                        <Copy size={14} />
                        Copiar Pix
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={checkingPayment}
                      onClick={verifySignupPayment}
                    >
                      <RefreshCcw size={14} />
                      Verificar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === 'register' && (
              <div className="grid gap-2">
                <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/10 px-3 py-2.5 text-left text-sm text-primary">
                  <Store size={16} />
                  Cadastro como vendedor por R$ 20
                </div>
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
              {paymentNotice && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 overflow-hidden rounded-xl bg-success/10 px-3 py-2 text-sm text-success"
                >
                  <CheckCircle2 size={15} className="shrink-0" />
                  {paymentNotice}
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
              {loading ? 'Entrando…' : mode === 'login' ? 'Entrar' : 'Gerar Pix Mercado Pago'}
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
