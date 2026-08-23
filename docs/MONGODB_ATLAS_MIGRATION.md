# Migracao MongoDB para Atlas

Este projeto deve usar uma unica fonte de dados MongoDB Atlas para local e
producao.

## Auditoria do projeto

- Backend principal: NestJS/TypeScript em `apps/backend`.
- ODM principal: Mongoose via `@nestjs/mongoose`.
- Backend Python incremental: FastAPI em `backend`.
- Driver Python: Motor (`AsyncIOMotorClient`).
- Variaveis novas: `MONGODB_URI` e `MONGODB_DATABASE`.
- Variaveis antigas aceitas temporariamente: `MONGO_URI` e `MONGO_DB_NAME`.
- Database padrao: `tecnoplus`.
- Compose local ainda possui `mongo` apenas no profile `local-db`, para rollback
  e testes pontuais.
- Compose de producao nao sobe MongoDB e exige `MONGODB_URI`.

Collections esperadas pelos schemas atuais:

```text
agent logs: logs
auth: users
campaigns: campaigns
integrations: shopee_connections, shopee_oauth_states,
  mercado_livre_connections, mercado_livre_oauth_states
marketing: marketing_posts, marketing_insights, marketing_analytics
products: products
dropshipping: organizations, supplier_profiles, seller_profiles, stores,
  addresses, supplier_products, marketplace_listings,
  product_listing_mappings, marketplace_orders, supplier_orders,
  order_documents, inventory_movements, sync_jobs, integration_logs,
  notifications, financial_entries, audit_logs
```

## Atlas

Crie um cluster MongoDB Atlas, preferindo M0 se o banco atual couber no limite
do plano. Se o tamanho exceder o limite gratuito, pare e escolha plano pago
somente com aprovacao.

Configure:

- Database user: `app_production`.
- Role: `readWrite` somente no database `tecnoplus`, salvo necessidade real.
- Network Access: IP publico da VPS em `/32`.
- Desenvolvimento local: adicione o IP local atual em `/32`; use `0.0.0.0/0`
  apenas temporariamente se o IP for dinamico e isso bloquear o trabalho.

## Backup na VPS

Nao remova volumes antigos. Gere backup antes de qualquer troca:

```bash
cd /opt/tecno-plus
mkdir -p /opt/backups/mongodb-before-atlas

docker run --rm --network host \
  -v /opt/backups:/backup \
  mongodb/mongodb-database-tools:latest \
  mongodump \
  --uri="$OLD_MONGODB_URI" \
  --out=/backup/mongodb-before-atlas
```

Se o Mongo antigo esta em container na mesma rede do Compose, use a rede do
Compose e a URI antiga apropriada, por exemplo:

```bash
docker run --rm --network tecno-plus_default \
  -v /opt/backups:/backup \
  mongodb/mongodb-database-tools:latest \
  mongodump \
  --uri="mongodb://mongo:27017/tecnoplus" \
  --out=/backup/mongodb-before-atlas
```

## Restore no Atlas

```bash
docker run --rm \
  -v /opt/backups:/backup \
  mongodb/mongodb-database-tools:latest \
  mongorestore \
  --uri="$MONGODB_URI" \
  --drop \
  /backup/mongodb-before-atlas
```

Use `--drop` somente quando o Atlas ainda for o destino novo da migracao. Nao
use esse comando depois que o Atlas ja estiver em producao.

## Validacao de dados

Rode a auditoria no Mongo antigo e no Atlas. Ela nao imprime URI nem senha.

```bash
OLD_MONGODB_URI="mongodb://mongo:27017/tecnoplus" \
MONGODB_URI="mongodb+srv://app_production:********@cluster.mongodb.net/tecnoplus?retryWrites=true&w=majority" \
npm run mongo:audit -- --source-env OLD_MONGODB_URI --target-env MONGODB_URI --database tecnoplus
```

Valide:

- Numero de databases de aplicacao.
- Numero de collections.
- Documentos por collection.
- Quantidade de indices por collection.
- TTL indexes de estados OAuth.

Se houver divergencia, nao troque a producao antes de investigar.

## Configuracao local

No `.env` local:

```env
MONGODB_URI=mongodb+srv://app_production:********@cluster.mongodb.net/tecnoplus?retryWrites=true&w=majority
MONGODB_DATABASE=tecnoplus
```

Depois:

```bash
npm run build:shared
npm run dev
```

Teste `http://localhost:3333/api/health` e fluxos CRUD que usam Mongo.

## Configuracao VPS

Atualize o secret/env de producao com:

```env
MONGODB_URI=mongodb+srv://app_production:********@cluster.mongodb.net/tecnoplus?retryWrites=true&w=majority
MONGODB_DATABASE=tecnoplus
```

Reinicie somente os servicos da aplicacao:

```bash
cd /opt/tecno-plus
docker compose -f docker-compose.prod.yml up -d --build backend bot frontend
docker compose -f docker-compose.prod.yml logs -f --tail=100 backend
```

## Testes obrigatorios

- Local: login, criar produto, listar, editar, excluir item de teste.
- VPS: repetir os mesmos fluxos via dominio de producao.
- Cruzado: criar no local e consultar na VPS.
- Cruzado: criar na VPS e consultar no local.
- Atlas: confirmar conexoes ativas, storage e operations.

## Rollback

Mantenha o Mongo antigo intacto. Para rollback, troque apenas:

```env
MONGODB_URI=<URI antiga do Mongo da VPS>
MONGODB_DATABASE=tecnoplus
```

Depois reinicie backend e bot. Nao execute `docker volume rm`, `rm -rf /data/db`
ou qualquer limpeza de volume enquanto o rollback ainda for necessario.
