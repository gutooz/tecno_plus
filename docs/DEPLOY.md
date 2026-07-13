# Deploy 24h grátis — tudo no Render

Este guia coloca o projeto no ar de graça e disponível de qualquer lugar,
usando só o Render (backend e frontend como dois Web Services separados):

- **Frontend (Next.js)** → Render (Web Service, free tier, `apps/frontend/Dockerfile`)
- **Backend (API + worker de filas + bot do Telegram)** → Render (Web Service, free tier, `apps/backend/Dockerfile`)
- **MongoDB** → Atlas (free tier M0)
- **Redis (BullMQ)** → Upstash (free tier)
- **Storage de imagens** → Supabase Storage (já usado no projeto)

## Por que dá pra ficar 100% grátis

O Render dorme serviços web gratuitos após ~15 min sem tráfego HTTP. A API,
o worker e o bot do Telegram rodam **no mesmo container** (veja
`apps/backend/Dockerfile`), então um único ping HTTP periódico mantém os
três processos vivos — sem precisar do Background Worker pago do Render.

## 1. MongoDB Atlas

Você já está criando — só garanta:

- Cluster free (M0).
- Um usuário de banco com senha.
- Network Access liberado para `0.0.0.0/0` (o Render usa IPs dinâmicos).
- Copie a connection string (`mongodb+srv://...`) → vai virar `MONGO_URI`.

## 2. Redis grátis (Upstash)

1. Crie uma conta em upstash.com → **Create Database** (regional, free tier).
2. Na aba **Details**, pegue: `Endpoint`, `Port` (6379) e `Password`.
3. Variáveis de ambiente:
   ```
   REDIS_HOST=<endpoint>
   REDIS_PORT=6379
   REDIS_PASSWORD=<password>
   REDIS_TLS=true
   ```

## 3. Supabase Storage (imagens)

Se ainda não tiver: crie um projeto em supabase.com, um bucket público
(ex.: `product-images`) e pegue `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
Sem isso o `StorageService` cai em modo no-op (funciona, mas não persiste
imagem — ok só para teste rápido).

## 4. Backend no Render

1. render.com → **New > Web Service** → conecte o repositório Git.
2. **Runtime**: Docker. **Dockerfile Path**: `apps/backend/Dockerfile`.
   **Docker Build Context**: raiz do repo (`.`) — o Dockerfile já assume isso.
3. **Instance Type**: Free.
4. Variáveis de ambiente (Environment): copie tudo do seu `.env`, com estes
   ajustes de produção:
   ```
   NODE_ENV=production
   MONGO_URI=<connection string do Atlas>
   REDIS_HOST=<endpoint upstash>
   REDIS_PORT=6379
   REDIS_PASSWORD=<senha upstash>
   REDIS_TLS=true
   CORS_ORIGIN=<URL do frontend na Vercel, ex.: https://seu-app.vercel.app>
   JWT_SECRET=<gere um novo, forte>
   JWT_REFRESH_SECRET=<gere outro>
   ```
   Não defina `PORT` — o Render injeta automaticamente e o backend já lê essa
   variável (`configuration.ts`).
5. Deploy. Ao subir, teste `https://<seu-servico>.onrender.com/api/health`
   — deve responder `{"status":"ok", ...}`.

## 5. Frontend no Render

1. render.com → **New > Web Service** → conecte o mesmo repositório.
2. **Runtime**: Docker. **Dockerfile Path**: `apps/frontend/Dockerfile`.
   **Docker Build Context**: raiz do repo (`.`).
3. **Instance Type**: Free.
4. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://<nome-do-backend>.onrender.com
   ```
5. Deploy. Depois, volte no Web Service do **backend** e atualize
   `CORS_ORIGIN` com a URL final do frontend (ex.:
   `https://<nome-do-frontend>.onrender.com`), e faça redeploy do backend.

## 6. Cron de keep-alive (mantém os dois serviços acordados 24h)

Cada Web Service free do Render dorme sozinho após ~15 min sem tráfego —
então cada um precisa do seu próprio ping. Use um cron HTTP gratuito:

- **cron-job.org** (mais simples): crie uma conta e adicione dois cron
  jobs, um por serviço, intervalo de 10 min:
  - `GET https://<nome-do-backend>.onrender.com/api/health`
  - `GET https://<nome-do-frontend>.onrender.com/` (qualquer rota responde)
- Alternativa: um workflow do GitHub Actions agendado (`schedule: cron`)
  que faz `curl` nas duas URLs a cada 10 min.

Isso é suficiente: nenhum dos dois fica 15 min sem tráfego, então nenhum
container dorme — e no backend, API, worker e bot continuam rodando juntos.

## 7. Telegram bot em produção

O bot usa long-polling (não precisa de webhook/URL pública). Assim que o
container do Render estiver de pé com `TELEGRAM_BOT_TOKEN` configurado, o
bot começa a responder normalmente — sem passo extra.

## Checklist rápido

- [ ] Atlas: cluster criado, IP liberado, `MONGO_URI` em mãos
- [ ] Upstash: `REDIS_HOST/PORT/PASSWORD`, `REDIS_TLS=true`
- [ ] Supabase Storage configurado (ou aceitar modo no-op)
- [ ] Backend deployado no Render (Docker, free tier) com todas as env vars
- [ ] Frontend deployado no Render (Docker, free tier) com `NEXT_PUBLIC_API_URL`
- [ ] `CORS_ORIGIN` do backend apontando para a URL do frontend no Render
- [ ] Cron de keep-alive pingando os dois serviços a cada 10 min
