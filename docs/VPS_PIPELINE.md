# Esteira de deploy na VPS Hostinger

Esta esteira publica o projeto do GitHub `gutooz/tecno_plus` em uma VPS com
Docker Compose e HTTPS automatico via Caddy.

## O que a esteira faz

1. A cada push na branch `main`, o GitHub Actions roda `npm ci` e `npm run build`.
2. Se o build passar, copia os arquivos para a VPS por SSH.
3. Escreve o `.env` de producao a partir do secret `PROD_ENV_FILE`.
4. Executa `docker compose -f docker-compose.prod.yml up -d --build --remove-orphans`.
5. Testa `https://seu-dominio/api/health`.

## Primeira preparacao da VPS

Entre na VPS como `root` ou um usuario com `sudo` e rode:

```bash
apt update
apt install -y ca-certificates curl gnupg git rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Abra as portas no firewall da VPS/Hostinger:

- `22/tcp` para SSH
- `80/tcp` para HTTP
- `443/tcp` para HTTPS

O dominio `zycron.online` precisa apontar para o IPv4 da VPS com registro `A`.

## Chave SSH para o GitHub Actions

Na sua maquina, gere uma chave para deploy:

```bash
ssh-keygen -t ed25519 -C "github-actions-tecno-plus" -f ./tecno_plus_deploy_key
```

Na VPS, adicione a chave publica:

```bash
mkdir -p ~/.ssh
cat tecno_plus_deploy_key.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

No GitHub, va em:

`gutooz/tecno_plus` -> Settings -> Secrets and variables -> Actions -> New repository secret

Crie:

- `VPS_HOST`: IP da VPS Hostinger
- `VPS_USER`: usuario SSH, por exemplo `root`
- `VPS_PORT`: `22` se nao mudou
- `VPS_SSH_KEY`: conteudo inteiro do arquivo privado `tecno_plus_deploy_key`
- `VPS_APP_DIR`: `/opt/tecno-plus`
- `PROD_ENV_FILE`: conteudo baseado em `infra/vps.env.example`

## MongoDB Atlas

O `PROD_ENV_FILE` deve apontar para o mesmo cluster Atlas usado no ambiente
local:

```env
MONGODB_URI=mongodb+srv://app_production:********@cluster.mongodb.net/tecnoplus?retryWrites=true&w=majority
MONGODB_DATABASE=tecnoplus
```

Nao coloque `mongodb://mongo` nem credenciais reais no repositorio. O MongoDB
antigo da VPS deve permanecer preservado como rollback ate a validacao final.

## Variaveis importantes para a Shopee

No `PROD_ENV_FILE`, confira:

```env
APP_DOMAIN=zycron.online
PUBLIC_APP_URL=https://zycron.online
CORS_ORIGIN=https://zycron.online
SHOPEE_REDIRECT_URL=https://zycron.online/api/integrations/shopee/callback
SHOPEE_PARTNER_ID=...
SHOPEE_PARTNER_KEY=...
TOKEN_ENCRYPTION_KEY=<mesma chave forte usada quando a loja foi conectada>
```

No painel da Shopee Open Platform, a Redirect URL precisa ser exatamente:

```text
https://zycron.online/api/integrations/shopee/callback
```

## Bot do Telegram

O `docker-compose.prod.yml` sobe um serviço `bot` separado (mesma imagem do
backend, rodando `node apps/backend/dist/telegram.js`). Sem essas três
variáveis no `PROD_ENV_FILE`, o serviço sobe mas o bot não responde:

```env
TELEGRAM_BOT_TOKEN=<token do @BotFather>
TELEGRAM_CHAT_ID=<IDs de chat autorizados, separados por vírgula>
TELEGRAM_OWNER_ID=<ownerId dos produtos cadastrados pelo bot>
```

O deploy preserva essas variáveis operacionais quando o `PROD_ENV_FILE` novo
vem sem valor, para evitar que um redeploy derrube a Shopee, o Asaas ou o bot
por acidente. Ainda assim, mantenha o secret completo e atualizado no GitHub.

## Deploy manual

Depois dos secrets configurados, va em:

GitHub -> Actions -> Deploy VPS -> Run workflow

Ou faca push na branch `main`.

## Comandos uteis na VPS

```bash
cd /opt/tecno-plus
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=100
docker compose -f docker-compose.prod.yml restart
docker compose -f docker-compose.prod.yml down
```

## Troca futura do nome do sistema

Quando o nome mudar, atualize primeiro textos e nomes visuais do frontend. A
esteira usa nomes genericos (`tecno-plus`) e pode ser renomeada depois sem
trocar a logica de deploy.
