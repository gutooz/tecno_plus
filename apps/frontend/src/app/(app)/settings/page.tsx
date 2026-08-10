'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  CircleAlert,
  ImageUp,
  MapPin,
  PackageCheck,
  Save,
  Search,
  Store,
} from 'lucide-react';
import { api, getSessionUser } from '@/lib/api';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o / GPT-4o-mini' },
  { id: 'claude', name: 'Claude', desc: 'Anthropic Claude' },
  { id: 'gemini', name: 'Gemini', desc: 'Google Gemini' },
];

interface SupplierCompany {
  storeName?: string;
  document?: string;
  logoUrl?: string;
}

interface SupplierPersonal {
  responsibleName?: string;
  email?: string;
  phone?: string;
}

interface SupplierOriginAddress {
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

interface ActivationItem {
  key: string;
  label: string;
  action: string;
  done: boolean;
}

interface SupplierSettingsResponse {
  profile: {
    personal?: SupplierPersonal;
    company?: SupplierCompany;
    approvalStatus?: string;
  };
  originAddress?: SupplierOriginAddress;
  activation: {
    items: ActivationItem[];
    completed: number;
    total: number;
    isCatalogVisible: boolean;
    sellableProducts: number;
  };
}

interface SupplierForm {
  personal: Required<SupplierPersonal>;
  company: Required<SupplierCompany>;
  originAddress: Required<SupplierOriginAddress>;
}

const EMPTY_SUPPLIER_FORM: SupplierForm = {
  personal: { responsibleName: '', email: '', phone: '' },
  company: { storeName: '', document: '', logoUrl: '' },
  originAddress: {
    cep: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
  },
};

interface CepLookupResponse {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const role = getSessionUser()?.role;
  const [provider, setProvider] = useState('openai');
  const [language, setLanguage] = useState('pt-BR');
  const [markup, setMarkup] = useState({ t1: 120, t2: 90, t3: 70, t4: 50 });
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(EMPTY_SUPPLIER_FORM);
  const [supplierDirty, setSupplierDirty] = useState(false);

  const supplierSettings = useQuery({
    queryKey: ['supplier-settings'],
    queryFn: () => api.get<SupplierSettingsResponse>('/dropshipping/supplier/settings'),
    enabled: role === 'supplier',
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!supplierSettings.data || supplierDirty) return;
    setSupplierForm(formFromSettings(supplierSettings.data));
  }, [supplierSettings.data, supplierDirty]);

  const saveSupplier = useMutation({
    mutationFn: (body: SupplierForm) =>
      api.patch<SupplierSettingsResponse>('/dropshipping/supplier/settings', body),
    onSuccess: (data) => {
      setSupplierForm(formFromSettings(data));
      setSupplierDirty(false);
      qc.setQueryData(['supplier-settings'], data);
      qc.invalidateQueries({ queryKey: ['seller-catalog'] });
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) =>
      api.uploadTo<SupplierSettingsResponse>('/dropshipping/supplier/settings/logo', [file]),
    onSuccess: (data) => {
      setSupplierForm(formFromSettings(data));
      setSupplierDirty(false);
      qc.setQueryData(['supplier-settings'], data);
      qc.invalidateQueries({ queryKey: ['seller-catalog'] });
    },
  });

  const lookupCep = useMutation({
    mutationFn: (cep: string) =>
      api.get<CepLookupResponse>(
        `/dropshipping/supplier/address/cep/${encodeURIComponent(cep.replace(/\D/g, ''))}`,
      ),
    onSuccess: (address) => {
      setSupplierDirty(true);
      setSupplierForm((current) => ({
        ...current,
        originAddress: {
          ...current.originAddress,
          cep: address.cep,
          street: address.street,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
        },
      }));
    },
  });

  const updateSupplierField = <Section extends keyof SupplierForm>(
    section: Section,
    key: keyof SupplierForm[Section],
    value: string,
  ) => {
    setSupplierDirty(true);
    setSupplierForm((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  };

  const requestCepLookup = (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length === 8 && !lookupCep.isPending) lookupCep.mutate(digits);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Configurações"
        subtitle="Cadastro do fornecedor, preferências e regras de precificação"
      />

      {role === 'supplier' && (
        <SupplierActivationSettings
          data={supplierSettings.data}
          loading={supplierSettings.isLoading}
          form={supplierForm}
          dirty={supplierDirty}
          saving={saveSupplier.isPending}
          logoUploading={uploadLogo.isPending}
          cepLoading={lookupCep.isPending}
          onChange={updateSupplierField}
          onLogoFile={(file) => uploadLogo.mutate(file)}
          onCepLookup={requestCepLookup}
          onSubmit={(event) => {
            event.preventDefault();
            saveSupplier.mutate(supplierForm);
          }}
        />
      )}

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
          As chaves de API são configuradas com segurança no backend, nunca no navegador.
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

function SupplierActivationSettings({
  data,
  loading,
  form,
  dirty,
  saving,
  logoUploading,
  cepLoading,
  onChange,
  onLogoFile,
  onCepLookup,
  onSubmit,
}: {
  data?: SupplierSettingsResponse;
  loading: boolean;
  form: SupplierForm;
  dirty: boolean;
  saving: boolean;
  logoUploading: boolean;
  cepLoading: boolean;
  onChange: <Section extends keyof SupplierForm>(
    section: Section,
    key: keyof SupplierForm[Section],
    value: string,
  ) => void;
  onLogoFile: (file: File) => void;
  onCepLookup: (cep: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const activation = data?.activation;
  return (
    <form onSubmit={onSubmit}>
      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Checklist de ativação</p>
            <p className="mt-1 text-xs text-muted">
              {activation?.completed ?? 0} de {activation?.total ?? 5} etapas concluídas
            </p>
          </div>
          <span
            className={cn(
              'inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
              activation?.isCatalogVisible
                ? 'bg-success/14 text-success'
                : 'bg-warning/15 text-warning',
            )}
          >
            {activation?.isCatalogVisible ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
            {activation?.isCatalogVisible ? 'Visível aos vendedores' : 'Pendente para vendedores'}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {loading &&
            Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-2xl" />
            ))}
          {!loading &&
            activation?.items.map((item) => (
              <div
                key={item.key}
                className={cn(
                  'min-h-16 rounded-2xl border px-3 py-2.5',
                  item.done
                    ? 'border-success/25 bg-success/[0.05]'
                    : 'border-border bg-surface-2/60',
                )}
              >
                <div className="flex items-start gap-2">
                  {item.done ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                  ) : (
                    <CircleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {item.done ? 'Concluído' : item.action}
                    </p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle icon={Store} title="Dados da empresa" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="Nome da loja"
              value={form.company.storeName}
              onChange={(e) => onChange('company', 'storeName', e.target.value)}
            />
            <Input
              placeholder="CNPJ ou CPF"
              value={form.company.document}
              onChange={(e) => onChange('company', 'document', e.target.value)}
            />
            <div className="sm:col-span-2">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/60 p-3 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
                  {form.company.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.company.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageUp size={22} className="text-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Logo da empresa</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Envie uma imagem quadrada ou retangular da marca.
                  </p>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-fg transition-all duration-200 ease-out-soft hover:brightness-[1.06]">
                  <ImageUp size={15} />
                  {logoUploading ? 'Enviando...' : 'Enviar foto'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={logoUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onLogoFile(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            <Input
              placeholder="Responsável"
              value={form.personal.responsibleName}
              onChange={(e) => onChange('personal', 'responsibleName', e.target.value)}
            />
            <Input
              placeholder="Telefone"
              value={form.personal.phone}
              onChange={(e) => onChange('personal', 'phone', e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle icon={PackageCheck} title="Status" />
          <div className="mt-4 space-y-3 text-sm">
            <InfoLine
              label="Produtos liberados"
              value={String(activation?.sellableProducts ?? 0)}
            />
            <InfoLine
              label="Aprovação"
              value={data?.profile.approvalStatus === 'approved' ? 'Aprovada' : 'Pendente'}
            />
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <SectionTitle icon={MapPin} title="Endereço de origem" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            placeholder="CEP"
            value={form.originAddress.cep}
            onChange={(e) => {
              onChange('originAddress', 'cep', e.target.value);
              onCepLookup(e.target.value);
            }}
            onBlur={(e) => onCepLookup(e.target.value)}
            trailingIcon={
              <button
                type="button"
                onClick={() => onCepLookup(form.originAddress.cep)}
                className="text-muted transition hover:text-primary"
                aria-label="Buscar CEP"
                disabled={cepLoading}
              >
                <Search size={15} className={cn(cepLoading && 'animate-pulse')} />
              </button>
            }
            className="lg:col-span-2"
          />
          <Input
            placeholder="Rua"
            value={form.originAddress.street}
            onChange={(e) => onChange('originAddress', 'street', e.target.value)}
            className="sm:col-span-2 lg:col-span-4"
          />
          <Input
            placeholder="Número"
            value={form.originAddress.number}
            onChange={(e) => onChange('originAddress', 'number', e.target.value)}
            className="lg:col-span-2"
          />
          <Input
            placeholder="Bairro"
            value={form.originAddress.neighborhood}
            onChange={(e) => onChange('originAddress', 'neighborhood', e.target.value)}
            className="lg:col-span-2"
          />
          <Input
            placeholder="Cidade"
            value={form.originAddress.city}
            onChange={(e) => onChange('originAddress', 'city', e.target.value)}
            className="lg:col-span-1"
          />
          <Input
            placeholder="UF"
            value={form.originAddress.state}
            onChange={(e) => onChange('originAddress', 'state', e.target.value)}
            className="lg:col-span-1"
            maxLength={2}
          />
        </div>
        <Button className="mt-5" size="sm" loading={saving} disabled={!dirty && !saving}>
          <Save size={15} />
          Salvar cadastro do fornecedor
        </Button>
      </Card>
    </form>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Store; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={16} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
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

function formFromSettings(data: SupplierSettingsResponse): SupplierForm {
  return {
    personal: {
      responsibleName: data.profile.personal?.responsibleName ?? '',
      email: data.profile.personal?.email ?? '',
      phone: data.profile.personal?.phone ?? '',
    },
    company: {
      storeName: data.profile.company?.storeName ?? '',
      document: data.profile.company?.document ?? '',
      logoUrl: data.profile.company?.logoUrl ?? '',
    },
    originAddress: {
      cep: data.originAddress?.cep ?? '',
      street: data.originAddress?.street ?? '',
      number: data.originAddress?.number ?? '',
      neighborhood: data.originAddress?.neighborhood ?? '',
      city: data.originAddress?.city ?? '',
      state: data.originAddress?.state ?? '',
    },
  };
}
