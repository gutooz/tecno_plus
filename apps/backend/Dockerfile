# Backend (NestJS) — build a partir da raiz do monorepo
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

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

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/
EXPOSE 3333
# Sobe API e worker no mesmo container (dev). Em produção, separe em 2 serviços.
CMD ["sh", "-c", "node apps/backend/dist/worker.js & node apps/backend/dist/main.js"]
