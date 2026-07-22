# HR Operations Platform — agent guide

Read this first. The architecture is FROZEN (architecture.md v1.4) — it is the
build contract. Changes go through ADRs (adr/), never through drift.

## Working rules (owner-established, non-negotiable)

1. **One task at a time from BACKLOG.md, approval-gated.** Present the task
   card (objective, files, DoD, evidence, dependencies, risks), wait for
   explicit approval, implement, close with evidence. Never write code for
   future tasks.
2. **Evidence closes tasks, not claims** — `evidence/` folder, one file per
   task: command outputs, test results, links. "It works" without proof
   closes nothing.
3. **Commits:** small, reviewable, `WS-XX:` (or task-id) prefixed, pushed to
   origin main. Co-author trailer per harness convention.
4. **Verify before building on assumptions** — the AWS region saga in
   ADR-006 (rev. 1→4) is the cautionary tale: press releases lied, the
   console and official docs told the truth.
5. Deviating from the frozen architecture requires surfacing the conflict,
   not improvising around it.

## Map

| File | What |
|---|---|
| architecture.md | Frozen v1.4 build contract |
| adr/README.md | Decision index (ADR-001..009, statuses) |
| BACKLOG.md | Task board + cards + working rules |
| ACTION-PLAN.md | Phased plan, DoD checklists with evidence rule |
| evidence/skeleton/ | Per-task proof (WS-01..) |
| docs/FIELD-MAPPING.md | ACTIVE: reference-system (Qiwa/GOSI/Muqeem/Mudad/Absher) Employee fields, sensitivity-tagged (0.8) — source for the Employees schema |
| docs/PROVISIONING-AWS.md | ACTIVE: AWS UAE interim staging + status log |
| docs/HANDOFF-WS20.md | In-flight infra state + exact next commands |
| apps/api/src/modules/README.md | Module layout contract + RLS table checklist |

## Current state (2026-07-22)

Walking skeleton **CLOSED** (WS-22). Priority-2 foundation modules built with
evidence: **Auth AUTH-01..08** (2.1+2.2 — identity, login+Redis sessions,
session guard, permission catalog+policy, logout/revocation, TOTP MFA
admin-must-enroll, /auth/me + role-aware web UI). **Audit AUDIT-01..05** (2.3 —
append-only `aud_entries`, synchronous transactional `AuditService.record`,
CI write-audit coverage, admin read API + viewer UI). **Clients CLIENT-01..04**
(2.5 — `cli_clients` PK-scoped registry, staff CRUD, client-rep user mgmt,
console UI). **Employees 0.8 + EMP-01..03** (3.1 — `emp_employees`, field-level
authz redacting salary/govdata per capability, console UI with redaction
reflected). **Configuration 2.4 STARTED: CONF-01 done** (settings catalog +
system-level resolution + System-Admin API + `cfg_system_settings`; three-level
model's system tier — CONF-02 per-client / CONF-03 per-user next). Suite
**122/122**. **Next candidates: CONF-02 (per-client overrides) or the AWS
decision.** WS-20/21 still blocked: AWS account fully restricted since signup
(ECS throttle, RDS InvalidAction, ECR KMS deny, ALB stuck "provisioning");
support case escalated; decision point → fresh account or OCI fallback
(ADR-006). Infra pickup: docs/HANDOFF-WS20.md.

## Technical landmines (each cost real debugging — do not rediscover)

- RLS policies MUST use `NULLIF(current_setting('app.client_id', true), '')::uuid` — pooled connections leave the GUC as '' not NULL (SPIKE-001).
- Turbo v2 strict env: env vars must be declared in turbo.json `globalEnv` or tasks won't see them (CI broke on this).
- NestJS DI needs VALUE imports; `consistent-type-imports` is off for the API only.
- Prisma 7: URL lives in prisma.config.ts, runtime needs the pg driver adapter, `CHECKPOINT_DISABLE=1` on all db scripts (telemetry hangs). `migrate dev` does NOT reliably regenerate the client here — run `db:generate` explicitly after a migration or the new model's delegate is missing (AUDIT-01).
- pnpm v10: `pnpm deploy` needs `--legacy`; corepack shims live in ~/.local/bin (no sudo on this machine).
- shadcn here is Base UI (`render` prop), NOT Radix (`asChild`); init was run with `--rtl`.
- Physical Tailwind utilities (pl-/pr-/left-…) are lint errors — logical only.
- Every new client-scoped table follows the checklist in apps/api/src/modules/README.md and registers in the isolation harness (unregistered endpoints fail CI).
- Local ports: Postgres 5433, Redis 6380 (5432/6379 belong to another project).
- Do NOT run `next build` (prod) while the web dev/preview server is running — it clobbers `.next` and the dev server then throws `Cannot find module './NNN.js'`. Stop the dev server first, or verify only via the dev server (AUTH-08).

## Commands

pnpm install · pnpm turbo run lint typecheck test build ·
pnpm --filter @hr/api db:migrate|db:deploy|db:seed ·
docker compose up -d (local PG+Redis)
