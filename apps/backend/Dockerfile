# Backend (NestJS) — build a partir da raiz do monorepo
# Node 22+ é exigido pelo @supabase/supabase-js (realtime-js usa o WebSocket
# nativo do Node, só disponível a partir da v22).
FROM node:22-bookworm-slim AS base
WORKDIR /app
# NODE_ENV=production só é setado no estágio "runner" (fim do arquivo) — se
# setado aqui, o `npm install` abaixo pula devDependencies (typescript,
# @nestjs/cli) e o build quebra com "tsc: not found".

# Copia manifests para cache de dependências
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY apps/backend/package.json ./apps/backend/

FROM base AS deps
RUN npm install --workspaces --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY shared ./shared
COPY apps/backend ./apps/backend
RUN npm run build --workspace shared \
  && npm run build --workspace @tecnoplus/backend

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/
EXPOSE 3333
# Sobe API + bot do Telegram no mesmo container. O pipeline de IA agora roda
# DENTRO da API (sem Redis/worker), então não há mais processo worker. Um único
# Web Service (com HTTP para keep-alive) mantém os dois processos vivos; se
# qualquer um cair, `wait -n` encerra o container para a plataforma reiniciar.
CMD ["bash", "-c", "node apps/backend/dist/main.js & node apps/backend/dist/telegram.js & wait -n"]
