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
reflected). **Configuration 2.4 COMPLETE (CONF-01..05)** — three-level settings model
(system/client/user, resolve user→client→system), feature flags on the same
substrate, and the settings web UI. This closes all Priority-2 foundation
modules (2.1–2.5). **Documents+Storage epic (3.2) COMPLETE (STOR-01 + DOC-01..05)** — S3-compatible
Storage module (MinIO local), `doc_documents` registry (expiry first-class),
presigned upload flow (category-scoped), read/download/delete, virus-scan hook
(pluggable, EICAR dev scanner → quarantine; ClamAV deferred) + legal-hold
retention, and the documents web UI. **Notifications epic (3.3) COMPLETE (NOTIF-01..06)** —
BullMQ dispatch infra (producer/worker split), in-app notifications
(`notify` + read/mark-read, per-user), email channel (pluggable transport, dev
capture / SMTP deferred, ar/en templates, recipient-language), **per-user
email preferences** (`notif_preferences`, per-category opt-out gating email
dispatch; in-app always on), the **ADR-004 in-process domain-event bus**
(`modules/events`, `EventBus.publish` over @nestjs/event-emitter, awaited +
error-isolated) — the expiry scan PUBLISHES `DocumentExpiringEvent` and
Notifications SUBSCRIBES (`@OnEvent`), so document-expiry no longer imports
Notifications (**ADR-004 → Accepted**, outbox half deferred) — and the **web
notification bell** (unread badge + list + mark-read, RTL popover) + **settings
preferences panel** (per-category email toggles). **Document-expiry
engine (3.4): EXP-01..02 done** — `exp_alerts` idempotency ledger + scan
service (threshold tiers 60/30/14/7/1/0, category→staff recipients, bilingual
alerts via `NotificationsService.notify`; the first real cross-module consumer),
now on a **daily BullMQ repeatable job** (`0 6 * * *` Asia/Riyadh, worker in
`MainModule` only, gated by `flag.document-expiry-alerts` — ships dormant) + a
manual admin `POST /expiry/scan` trigger + **EXP-03 the expiry dashboard web UI**
(bucketed Expired/≤7/≤30/≤60d, dual-calendar, admin run-scan button). **Document-
expiry engine (3.4) COMPLETE (EXP-01..03).** API suite **195/195**; web typecheck+lint
green. **Eight product screens** (login, audit, clients, employees, settings,
documents, expiry) + a notification bell in the shell header. **Priority-3 domain
core COMPLETE: 3.1 Employees, 3.2 Documents, 3.3 Notifications, 3.4 Document-expiry.**
**Priority 4 — Requests + Tasks epic (REQ-01..02 done)** — `req_requests`
client-scoped table (the FIRST table clients WRITE) + `RequestsService`, and the
**dual-path HTTP API** (REQ-02): staff manage requests cross-client while client
reps create/read/update only their OWN client's (RLS via `ScopedPrismaService`,
`WITH CHECK` on writes) — the first real end-to-end client-rep write path,
isolation proven per-endpoint. API suite **205/205**. **Next: REQ-03 (processing +
SLA — `request.process` status workflow + notify) or TASK-01 (Tasks table).
AWS/OCI decision (ADR-006) open.** WS-20/21 still blocked: AWS account fully restricted since signup
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
- Local ports: Postgres 5433, Redis 6380, MinIO 9002 (API) / 9003 (console) — non-default because 5432/6379/9000 belong to other local tooling. `docker compose up -d` now includes MinIO; storage e2e (STOR-01) requires it up. StorageService is endpoint-configurable + `forcePathStyle` (MinIO); prod object-store provider is still ADR-006-open. Presigned uploads go browser→object-store DIRECTLY (never through the API); this works on MinIO's default CORS locally — a stricter production object store must have CORS configured for the web origin (DOC-05).
- Do NOT run `next build` (prod) while the web dev/preview server is running — it clobbers `.next` and the dev server then throws `Cannot find module './NNN.js'`. Stop the dev server first, or verify only via the dev server (AUTH-08).
- BullMQ (NOTIF-01): the connection needs `maxRetriesPerRequest: null`. A Worker holds a blocking Redis connection whose teardown emits a benign "Connection is closed" unhandled rejection in EVERY app-creating spec → suite exit 1. Fix in place: producer (`QueueModule` in `AppModule`) is split from the worker (`DispatchWorkerModule`), which runs only in `MainModule` (main.ts) + the queue e2e. Keep workers out of `AppModule`.

## Commands

pnpm install · pnpm turbo run lint typecheck test build ·
pnpm --filter @hr/api db:migrate|db:deploy|db:seed ·
docker compose up -d (local PG+Redis)
