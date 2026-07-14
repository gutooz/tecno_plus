'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

/**
 * Tela de Configurações. No MVP, provedor de IA e chaves são definidos por
 * variáveis de ambiente no backend (seguro). Esta tela ilustra a experiência
 * e persiste preferências não sensíveis (idioma, markup) — ligar a um endpoint
 * de settings é uma extensão direta (ver roadmap).
 */
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o / GPT-4o-mini' },
  { id: 'claude', name: 'Claude', desc: 'Anthropic Claude' },
  { id: 'gemini', name: 'Gemini', desc: 'Google Gemini' },
];

export default function SettingsPage() {
  const [provider, setProvider] = useState('openai');
  const [language, setLanguage] = useState('pt-BR');
  const [markup, setMarkup] = useState({ t1: 120, t2: 90, t3: 70, t4: 50 });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Configurações"
        subtitle="Provedor de IA, idioma e regras de precificação"
      />

      <Card className="mb-4">
        <p className="mb-3.5 text-sm font-semibold">Provedor de IA</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {PROVIDERS.map((prov) => {
            const active = provider === prov.id;
            return (
              <button
                key={prov.id}
                onClick={() => setProvider(prov.id)}
                aria-pressed={active}
                className={cn(
                  'relative rounded-2xl border p-4 text-left transition-all duration-200 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
                  active
                    ? 'border-primary/40 bg-primary/[0.06] shadow-xs'
                    : 'border-border hover:border-border-strong hover:bg-surface-2',
                )}
              >
                {active && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <p className="font-medium">{prov.name}</p>
                <p className="mt-0.5 text-xs text-muted">{prov.desc}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-3.5 text-xs text-muted">
          As chaves de API são configuradas com segurança no backend (variáveis de ambiente), nunca
          no navegador.
        </p>
      </Card>

      <Card className="mb-4">
        <p className="mb-3.5 text-sm font-semibold">Idioma dos anúncios</p>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-fg outline-none transition-all duration-200 ease-out-soft focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en-US">English (US)</option>
          <option value="es-ES">Español</option>
        </select>
      </Card>

      <Card>
        <p className="mb-3.5 text-sm font-semibold">Markup por faixa de preço (%)</p>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <Field
            label="Até R$30"
            value={markup.t1}
            onChange={(v) => setMarkup({ ...markup, t1: v })}
          />
          <Field
            label="R$30–100"
            value={markup.t2}
            onChange={(v) => setMarkup({ ...markup, t2: v })}
          />
          <Field
            label="R$100–300"
            value={markup.t3}
            onChange={(v) => setMarkup({ ...markup, t3: v })}
          />
          <Field
            label="Acima"
            value={markup.t4}
            onChange={(v) => setMarkup({ ...markup, t4: v })}
          />
        </div>
        <Button className="mt-5" size="sm">
          Salvar
        </Button>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted">{label}</label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 nums"
      />
    </div>
  );
}
