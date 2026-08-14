export default function SupportPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10 text-fg">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Suporte</h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          Para suporte sobre integração Shopee, conexão de loja, produtos, pedidos ou documentos,
          entre em contato com a equipe responsável pela operação da Tecno Plus.
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          <p className="font-medium text-fg">Canais</p>
          <p className="mt-2">E-mail de suporte: tecnoplus.comercial@outlook.com</p>
          <p className="mt-1">Horário de atendimento: dias úteis, em horário comercial.</p>
        </div>
      </div>
    </main>
  );
}
