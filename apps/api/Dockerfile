# Multi-target build for the API.
#   target=runtime  -> the API image. Default command: dist/http.js (HTTP only —
#                      the Cloud Run service). The worker pool runs the SAME
#                      image with `node dist/worker.js` (GCP-04).
#   target=migrate  -> the Cloud Run migrate job: prisma/deploy.sh = migrate
#                      deploy, then set the app_* role passwords from env.
#   target=seed     -> the Cloud Run jobs `uat-seed` (prisma/seed.ts) and
#                      `uat-smoke` (scripts/uat-smoke.mjs). UAT ONLY (GCP-06): the
#                      builder's full workspace, because the seed loads API modules.
#                      seed-guard.ts refuses without SEED_TARGET=uat + a supplied
#                      password, so this image cannot seed production.

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
CMD ["node", "dist/http.js"]

FROM node:22-slim AS migrate
WORKDIR /app
# Standalone migration runner: only the schema, migrations, config, and the
# prisma CLI — no workspace dependencies.
RUN npm init -y >/dev/null && npm install prisma@7.8.0 dotenv@17 >/dev/null && npx prisma --version | head -1
COPY --from=builder /repo/apps/api/prisma ./prisma
COPY --from=builder /repo/apps/api/prisma.config.ts ./prisma.config.ts
ENV CHECKPOINT_DISABLE=1
CMD ["sh", "prisma/deploy.sh"]

FROM builder AS seed
WORKDIR /repo/apps/api
ENV NODE_ENV=production CHECKPOINT_DISABLE=1
CMD ["npx", "tsx", "prisma/seed.ts"]
