# HR Operations Platform

An HR operations platform for a Saudi Arabian HR consultancy: recruitment, GRO (government relations), employee management, documents with expiry tracking, client requests, and a client portal — with strict per-client data isolation, Arabic/English localization, and all data hosted in KSA.

## Status

Walking skeleton phase. Work proceeds one approved task at a time from the backlog.

## Getting started

Requires Node ≥ 22.14 (see `.nvmrc`). The package manager is pnpm, pinned via the `packageManager` field and provided by corepack (bundled with Node):

```sh
corepack enable    # one-time, may need sudo; afterwards `pnpm` works directly
pnpm install
pnpm build         # turbo run build across the workspace
```

If you can't (or don't want to) run `corepack enable`, prefix commands instead: `corepack pnpm install`.

## CI

Every push to `main` and every pull request runs `.github/workflows/ci.yml`: install → lint (including module-boundary and RTL rules) → typecheck → test → build. A red run blocks the change.

**Recommended repo setting** (GitHub → Settings → Branches → Add branch ruleset for `main`): require the `CI / ci` status check to pass before merging, and require pull requests for changes to `main`. The open PR "Do not merge — WS-09 CI red proof" is the standing demonstration that boundary violations fail CI.

## Documents

| Document | Purpose |
|---|---|
| [architecture.md](architecture.md) | **The build contract** — frozen as Version 1. Principles, modules, isolation model, localization, integrations |
| [BACKLOG.md](BACKLOG.md) | Implementation backlog: task cards, working rules, status board |
| [ACTION-PLAN.md](ACTION-PLAN.md) | Phased plan with dependencies and evidence-backed definitions of done |
| [adr/README.md](adr/README.md) | Architecture Decision Records index (ADR-001…009) |
| [SPIKE-001-rls-prisma-pooling.md](SPIKE-001-rls-prisma-pooling.md) | Technical spike: RLS + Prisma + connection pooling |
| [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md) | The original architecture review that shaped v1 |

## Ground rules

- The architecture document is frozen; changes go through ADRs, not drift.
- Modules communicate only through public interfaces — no cross-module database access.
- Every client-owned record is isolated by `client_id`, with PostgreSQL RLS as a fail-closed backstop.
- Deny-by-default authorization; permissions follow the `resource.action` convention.
- Tasks close with evidence (`evidence/` folder), not claims.
