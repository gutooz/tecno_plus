export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10 text-fg">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          A Tecno Plus Dropshipping utiliza dados de conta, loja, produtos, anúncios e pedidos
          apenas para operar a integração autorizada pelo usuário, incluindo autenticação,
          publicação, sincronização, atendimento de pedidos e registros de auditoria.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">
          Tokens e credenciais de marketplace são armazenados criptografados no backend e não são
          exibidos no frontend. Dados pessoais de compradores são limitados ao mínimo necessário
          para processar pedidos e documentos autorizados pela integração oficial.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">
          Solicitações sobre acesso, correção ou remoção de dados podem ser feitas pelo canal de
          suporte informado nesta aplicação.
        </p>
      </div>
    </main>
  );
}
