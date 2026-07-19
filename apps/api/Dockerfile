# Multi-target build for the API.
#   target=runtime  -> production API server (default)
#   target=migrate  -> prisma migrate deploy runner (ECS one-off task)

FROM node:22-slim AS builder
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc* ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter '!@hr/web' --filter '!@hr/spike-001-rls'
RUN pnpm turbo run build --filter=@hr/api
RUN pnpm --filter=@hr/api deploy --prod --legacy /prod/api

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /prod/api .
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM node:22-slim AS migrate
WORKDIR /app
# Standalone migration runner: only the schema, migrations, config, and the
# prisma CLI — no workspace dependencies.
RUN npm init -y >/dev/null && npm install prisma@7.8.0 dotenv@17 >/dev/null && npx prisma --version | head -1
COPY --from=builder /repo/apps/api/prisma ./prisma
COPY --from=builder /repo/apps/api/prisma.config.ts ./prisma.config.ts
ENV CHECKPOINT_DISABLE=1
CMD ["npx", "prisma", "migrate", "deploy"]
