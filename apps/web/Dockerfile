FROM node:22-slim AS builder
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc* ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter '!@hr/api' --filter '!@hr/spike-001-rls'
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js resolves the /api rewrite (next.config.ts) AT BUILD TIME, so the API's
# address is a build argument: each environment builds its own web image
# (UAT: the internal uat-api URL). GCP-04.
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
RUN pnpm turbo run build --filter=@hr/web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
# Next's standalone output leaves public/ out on purpose (it expects a CDN or a
# copy). Without this line every /brand/* image 404'd on UAT — the login skyline
# and the sidebar wordmark (found after GCP-06).
COPY --from=builder /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
