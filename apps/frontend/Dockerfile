# Frontend (Next.js 15) — build a partir da raiz do monorepo
FROM node:20-bookworm-slim AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY apps/frontend/package.json ./apps/frontend/
RUN npm install --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY shared ./shared
COPY apps/frontend ./apps/frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @tecnoplus/frontend

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@tecnoplus/frontend"]
