# Auditoria e Plano de Migracao Python

Branch: `codex/python-fastapi-migration-foundation`

## Estrutura Atual

Frontend:

- Next.js 15, React 19, TypeScript, TailwindCSS, React Query e Framer Motion.
- App Router em `apps/frontend/src/app`.
- Cliente HTTP centralizado em `apps/frontend/src/lib/api.ts`.
- Contrato atual assume backend em `NEXT_PUBLIC_API_URL` e prefixo `/api`.
- Tokens JWT ficam em `localStorage` ou `sessionStorage` no MVP.

Backend:

- NestJS 10, TypeScript, Swagger, Passport JWT, Helmet, throttling global.
- Entrada HTTP em `apps/backend/src/main.ts`, com prefixo global `/api`.
- Modulos principais: auth, products, uploads, publish, ops, integrations,
  dropshipping, telegram, marketing, social, campaigns, ai, queues e storage.
- Pipeline de IA roda no mesmo processo via `setImmediate`, sem Redis/BullMQ ativo.
- Bot Telegram possui entrypoint separado em `apps/backend/src/telegram.ts`.

Banco:

- MongoDB via Mongoose, nao SQL relacional.
- Colecoes existentes: `users`, `products`, `agent_logs`, `shopee_connections`,
  `shopee_oauth_states`, `mercado_livre_connections`,
  `mercado_livre_oauth_states`, `campaigns`, `marketing_posts`,
  `marketing_insights`, `marketing_analytics`, `organizations`,
  `supplier_profiles`, `seller_profiles`, `stores`, `addresses`,
  `supplier_products`, `marketplace_listings`, `product_listing_mappings`,
  `marketplace_orders`, `supplier_orders`, `order_documents`,
  `inventory_movements`, `sync_jobs`, `integration_logs`, `notifications`,
  `financial_entries` e `audit_logs`.
- Muitos subdocumentos ainda sao `Object` livre; a validacao forte fica nos
  services/DTOs TypeScript e deve ser reforcada durante a migracao Python.

Autenticacao e autorizacao:

- Rotas atuais: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/refresh`.
- JWT HS256 com payload `{ sub, email, role }`.
- Senhas usam `bcryptjs`.
- Roles existentes: `admin`, `operator`, `supplier`, `seller`.
- `organizationId` existe em `users` e perfis, mas nem todos os endpoints
  aplicam tenant de forma uniforme. Este e um risco critico para SaaS.

Integracoes:

- IA: OpenAI, Anthropic Claude e Google Gemini via adapters.
- Storage: Supabase Storage.
- Marketplaces: Shopee Open Platform e Mercado Livre OAuth/API.
- Social/ads: Facebook Graph API e Marketing API.
- Pagamentos/financeiro: Asaas.
- Telegram: bot para cadastro por foto e aprovacao.
- Shopee export: geracao de planilha XLSX por template.

Infra:

- `docker-compose.yml` sobe Mongo e Redis; Redis ficou historico, pois o codigo
  atual ja removeu BullMQ do caminho principal.
- Apps Node rodam por profile `apps`.
- Deploy atual documentado para VPS/Render em `docs/` e `infra/`.
- CI existente: `.github/workflows/deploy-vps.yml`.

Principais modulos e contratos:

- Auth: autentica e emite tokens.
- Products: CRUD, paginacao, busca, export Shopee, duplicacao, reprocessamento,
  publicacao e regeneracao de imagens/pesos.
- Uploads: multipart em `/api/upload`, cria produtos e dispara pipeline.
- Dropshipping: onboarding supplier/seller, catalogo, listings, pedidos,
  financeiro, produtos de fornecedor, Telegram e webhook Asaas.
- Integrations: status e OAuth Shopee/Mercado Livre, webhooks Shopee e testes.
- Marketing/Social/Campaigns: geracao, calendario, publicacao e analytics.
- Ops/Health: dashboard, jobs, logs e saude.

Divida tecnica:

- Mongo schemas com muitos objetos livres dificultam contrato forte.
- Auth usa refresh token stateless; `refreshTokenHashes` existe no schema mas
  nao e usado para revogacao.
- Frontend ainda armazena tokens em storage do navegador.
- Regras de tenant/role aparecem nos services, mas falta uma politica central.
- Webhooks precisam de validacao de assinatura, idempotencia persistida e retry
  explicito em todos os provedores.
- Pipeline em processo simplifica custo, mas perde durabilidade em restart.
- Dinheiro aparece em campos numericos livres; migracao deve padronizar centavos
  inteiros ou `Decimal` em todos os contratos financeiros.

Riscos da migracao:

- Trocar Mongo por SQLAlchemy agora quebraria dados/IDs/colecoes e exigiria
  plano de dados separado. A fundacao Python usa MongoDB para preservar estado.
- Alterar prefixos ou nomes de campos quebra o frontend, especialmente
  `accessToken`, `refreshToken`, `user`, `_id` e estruturas livres de produtos.
- Migrar uploads/pipeline cedo demais pode quebrar IA, Supabase e export Shopee.
- Webhooks e pagamentos exigem idempotencia antes de qualquer reimplementacao.

## Estrutura Alvo

Curto prazo, sem apagar legado:

```text
.
├── apps/
│   ├── frontend/          # Next.js atual
│   └── backend/           # NestJS legado em operacao
├── backend/               # FastAPI novo
├── docs/
├── infra/
├── scripts/
├── shared/
├── docker-compose.yml
├── .env.example
└── README.md
```

Backend Python:

```text
backend/
├── app/
│   ├── main.py
│   ├── core/
│   ├── database/
│   ├── api/
│   ├── modules/
│   │   ├── auth/
│   │   └── health/
│   └── shared/
├── tests/
├── pyproject.toml
├── Dockerfile
└── README.md
```

## Plano Incremental

Fase 1 - Auditoria e fundacao:

- Criar `backend/` FastAPI isolado.
- Preservar MongoDB atual.
- Implementar health/readiness, erros padronizados, request id e CORS.
- Migrar auth mantendo contrato e JWT compativel.

Fase 2 - Compatibilidade operacional:

- Adicionar proxy/gateway ou configuracao de roteamento para enviar rotas
  migradas ao FastAPI e as demais ao NestJS.
- Gerar OpenAPI do FastAPI e comparar contratos usados pelo frontend.
- Cobrir auth com testes de integracao contra Mongo de teste.

Fase 3 - Usuarios, RBAC e tenancy:

- Centralizar `current_user`, `require_role` e escopo por `organizationId`.
- Revisar todos os endpoints multi-tenant antes de migrar dominios sensiveis.

Fase 4 - Products leitura/escrita basica:

- Migrar `GET /products`, `GET /products/{id}`, `PUT /products/{id}` e
  `DELETE /products/{id}` preservando filtros, paginacao e shape dos docs.
- Criar testes de regressao contra documentos Mongo reais anonimizados.

Fase 5 - Uploads e storage:

- Migrar multipart com limite de tamanho/tipo, nomes seguros e Supabase Storage.
- Manter pipeline Nest ou criar ponte enquanto agentes nao estiverem em Python.

Fase 6 - Dropshipping e financeiro:

- Migrar supplier/seller catalog, listings, orders e finance com idempotencia.
- Padronizar valores monetarios com centavos/Decimal.

Fase 7 - Integracoes e webhooks:

- Migrar Shopee, Mercado Livre, Facebook, Asaas e Telegram por provedor.
- Adicionar assinatura, logs, idempotencia e retries persistidos.

Fase 8 - Jobs/workers:

- Decidir entre manter execucao em processo, ARQ/Dramatiq/Celery, ou outra fila
  conforme volume real e custo.

Fase 9 - Desligamento do legado:

- Trocar frontend para o backend Python.
- Validar logs, webhooks, publicacoes e dados.
- Remover NestJS somente quando nao houver rotas dependentes.
