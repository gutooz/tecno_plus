# Relatório de implementação - dropshipping

## Análise da estrutura anterior

- Monorepo npm com `shared`, `apps/backend` e `apps/frontend`.
- Frontend: Next.js 15, React 19, Tailwind CSS, React Query, Framer Motion e lucide-react.
- Backend: NestJS, MongoDB/Mongoose, JWT, Passport, Swagger, Throttler global, Supabase Storage e filas internas.
- Autenticação anterior: `users` com `admin`/`operator`, login/registro JWT e refresh token.
- Banco anterior: MongoDB com schemas de `products`, usuários, integrações Shopee/Mercado Livre, marketing, campanhas e logs de agentes.
- Integração Shopee anterior: OAuth Open Platform, assinatura HMAC, tokens criptografados, teste de loja, leitura de pedidos recentes e exportação em massa por planilha.
- UI anterior: SaaS escuro/claro, cards compactos, tabelas responsivas, sidebar e bottom nav mobile.

## Arquivos criados

- `apps/backend/src/modules/database/schemas/dropshipping.schema.ts`
- `apps/backend/src/modules/dropshipping/dropshipping.module.ts`
- `apps/backend/src/modules/dropshipping/dropshipping.controller.ts`
- `apps/backend/src/modules/dropshipping/dropshipping.service.ts`
- `apps/backend/src/modules/dropshipping/marketplaces/marketplace-provider.ts`
- `apps/backend/src/modules/dropshipping/marketplaces/shopee.provider.ts`
- Páginas frontend em `apps/frontend/src/app/(app)/supplier/*`
- Páginas frontend em `apps/frontend/src/app/(app)/seller/*`
- `apps/frontend/src/app/(app)/admin/page.tsx`
- `apps/frontend/src/app/(app)/notifications/page.tsx`

## Arquivos modificados

- `apps/backend/src/app.module.ts`
- `apps/backend/src/config/configuration.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/auth/dto.ts`
- `apps/backend/src/modules/database/database.module.ts`
- `apps/backend/src/modules/database/schemas/user.schema.ts`
- `apps/backend/src/modules/database/schemas/shopee-connection.schema.ts`
- `apps/backend/src/modules/integrations/shopee-connections.service.ts`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/app/login/page.tsx`
- `apps/frontend/src/components/app-shell.tsx`
- `.env.example`

## Estrutura de banco adicionada

Como o projeto usa MongoDB/Mongoose, a migração foi feita por schemas e índices, sem apagar dados existentes.

Novas coleções equivalentes às entidades solicitadas:

- `organizations`
- `supplier_profiles`
- `seller_profiles`
- `stores`
- `addresses`
- `supplier_products`
- `marketplace_listings`
- `product_listing_mappings`
- `marketplace_orders`
- `supplier_orders`
- `order_documents`
- `inventory_movements`
- `sync_jobs`
- `integration_logs`
- `notifications`
- `financial_entries`
- `audit_logs`

Índices únicos relevantes:

- Produto do fornecedor por organização e SKU.
- Mapeamento por marketplace, item externo e variação externa.
- Pedido externo por marketplace e identificador externo.
- Pedido interno por chave de idempotência.
- Jobs de sincronização por chave de idempotência.

## Novas rotas

- `GET /api/dropshipping/me`
- `POST /api/dropshipping/onboarding/supplier`
- `POST /api/dropshipping/onboarding/seller`
- `GET /api/dropshipping/supplier/dashboard`
- `GET /api/dropshipping/supplier/products`
- `POST /api/dropshipping/supplier/products`
- `PATCH /api/dropshipping/supplier/products/:id`
- `POST /api/dropshipping/supplier/products/:id/duplicate`
- `DELETE /api/dropshipping/supplier/products/:id`
- `GET /api/dropshipping/supplier/orders`
- `GET /api/dropshipping/seller/dashboard`
- `GET /api/dropshipping/seller/catalog`
- `POST /api/dropshipping/seller/listings`
- `GET /api/dropshipping/seller/listings`
- `POST /api/dropshipping/seller/listings/:id/request-publication`
- `GET /api/dropshipping/seller/orders`
- `POST /api/dropshipping/seller/orders/import`
- `GET /api/dropshipping/admin/dashboard`
- `GET /api/integrations/shopee/config`
- `POST /api/integrations/shopee/webhook`
- `POST /api/integrations/shopee/deauthorization`

## URLs públicas para cadastrar no app Shopee

Substitua `https://seudominio.com` pelo domínio público real do backend/frontend em produção.

- Callback OAuth: `https://seudominio.com/api/integrations/shopee/callback`
- Webhook/push: `https://seudominio.com/api/integrations/shopee/webhook`
- Deauthorization: `https://seudominio.com/api/integrations/shopee/deauthorization`
- Política de privacidade: `https://seudominio.com/privacy`
- Termos de uso: `https://seudominio.com/terms`
- Suporte: `https://seudominio.com/support`

## Variáveis de ambiente

Já existiam:

- `SHOPEE_PARTNER_ID`
- `SHOPEE_PARTNER_KEY`
- `SHOPEE_REDIRECT_URL`
- `SHOPEE_WEBHOOK_URL`
- `SHOPEE_API_HOST`
- `TOKEN_ENCRYPTION_KEY`

Adicionadas ao exemplo:

- `SHOPEE_WEBHOOK_URL`
- `SHOPEE_REGION`
- `SHOPEE_ENVIRONMENT`

## Fluxos implementados

- Cadastro com escolha entre vendedor e fornecedor.
- Menus separados por perfil.
- Onboarding de fornecedor e vendedor via API.
- Cadastro/listagem/duplicação/exclusão segura de produtos do fornecedor.
- Arquivamento automático quando um produto tiver pedido vinculado.
- Registro de movimentação de estoque.
- Catálogo do vendedor com busca e simulador de margem.
- Preparação de anúncio com preço por percentual.
- Validação de publicação Shopee via provider dedicado.
- Callback OAuth Shopee com `state` de uso único e troca segura por tokens criptografados.
- Endpoint de webhook/push Shopee com log seguro de evento recebido.
- Endpoint de deautorização para marcar loja como revogada.
- Fila de publicação e estoque em `sync_jobs`.
- Importação idempotente de pedidos externos.
- Criação de pedido interno por fornecedor.
- Notificação de novo pedido.
- Entrada financeira inicial por pedido, sem split automático.
- Painel administrativo com contadores de aprovação, exceções e sincronização.

## Decisões técnicas

- Mantida a arquitetura atual: Next.js + NestJS + MongoDB.
- A Shopee ficou atrás de `MarketplaceProvider` e `ShopeeProvider`, preparada para Mercado Livre, Amazon e TikTok Shop.
- Tokens continuam criptografados em repouso com AES-256-GCM.
- Publicação direta não marca produto como publicado sem confirmação da API.
- Pedido sem mapeamento cai em exceção e notifica administradores.
- Exclusão definitiva de produto com pedido é bloqueada por arquivamento.

## Pendências

- Confirmar no console da Shopee Open Platform o tipo de app e permissões antes de enviar submissão.
- Preencher `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_REDIRECT_URL` e `SHOPEE_WEBHOOK_URL` no ambiente seguro.
- Confirmar no app Shopee criado se há esquema oficial de assinatura para push/webhook e ajustar a validação criptográfica exatamente conforme a documentação da conta.
- Implementar worker real para processar `sync_jobs`.
- Completar payload oficial de `product.add_item` somente após confirmar permissões/documentação da conta Shopee.
- Criar endpoints finais de upload/download seguro de documentos privados.
- Expandir precificação para lucro fixo e preço manual na UI.
- Criar telas administrativas completas de aprovação, auditoria e exceções.
- Adicionar testes e2e para fluxo de pedido.
