# Implementation Backlog

**Architecture:** `architecture.md` v1.4 (FROZEN). Every task below implements the frozen architecture; a task that needs to deviate from it stops and raises the conflict instead of improvising.

## Working rules

1. **One task at a time.** A task is picked, approved, implemented, evidenced, and reviewed before the next begins.
2. **Approval gate:** no code is written for a task until it is explicitly approved. No code is ever written for future tasks.
3. **One task ≈ one small PR/commit set.** Commits are small, reviewable, and independently testable, messaged `WS-XX: <what>`.
4. **Evidence closes tasks, not claims.** Each task's evidence goes to `evidence/skeleton/WS-XX.md` per the evidence rule in `ACTION-PLAN.md`.
5. **Statuses:** `todo` → `approved` → `in progress` → `in review` → `done`. Blocked tasks say what blocks them.

## Walking skeleton — status board

| ID | Task | Depends on | Status |
|---|---|---|---|
| WS-01 | Initialize repository | — | done ([evidence](evidence/skeleton/WS-01.md)) |
| WS-02 | Monorepo scaffolding (pnpm + Turborepo) | WS-01 | done ([evidence](evidence/skeleton/WS-02.md)) |
| WS-03 | Shared config package (tsconfig/eslint/prettier bases) | WS-02 | done ([evidence](evidence/skeleton/WS-03.md)) |
| WS-04 | Shared contracts package (Zod) | WS-03 | done ([evidence](evidence/skeleton/WS-04.md)) |
| WS-05 | NestJS API scaffold with health endpoints | WS-03 | done ([evidence](evidence/skeleton/WS-05.md)) |
| WS-06 | Next.js web scaffold | WS-03 | done ([evidence](evidence/skeleton/WS-06.md)) |
| WS-07 | Module skeleton + example module (ADR-003 layout) | WS-05 | done ([evidence](evidence/skeleton/WS-07.md)) |
| WS-08 | Boundary + RTL lint enforcement | WS-07, WS-06 | done ([evidence](evidence/skeleton/WS-08.md)) |
| WS-09 | CI pipeline (lint, typecheck, test, build) | WS-08 | done ([evidence](evidence/skeleton/WS-09.md)) |
| WS-10 | Local dev stack (Docker Compose: Postgres + Redis) | WS-01 | done ([evidence](evidence/skeleton/WS-10.md)) |
| WS-11 | Prisma setup + migration workflow | WS-10, WS-05 | done ([evidence](evidence/skeleton/WS-11.md)) |
| WS-12 | Execute SPIKE-001 (RLS + Prisma + pooling) → finalize ADR-001 | WS-11 | done ([evidence](evidence/skeleton/WS-12.md)) |
| WS-13 | Production RLS pattern (roles, policies, client extension) | WS-12 | done ([evidence](evidence/skeleton/WS-13.md)) |
| WS-14 | Request context + structured logging | WS-05 | done ([evidence](evidence/skeleton/WS-14.md)) |
| WS-15 | Deny-by-default authorization guard | WS-14 | done ([evidence](evidence/skeleton/WS-15.md)) |
| WS-16 | i18n scaffold (ar/en, runtime RTL switch) | WS-06 | done ([evidence](evidence/skeleton/WS-16.md)) |
| WS-17 | Hijri/Gregorian shared date utility | WS-04 | done ([evidence](evidence/skeleton/WS-17.md)) |
| WS-18 | Cross-client isolation test harness in CI | WS-13, WS-15, WS-09 | done ([evidence](evidence/skeleton/WS-18.md)) |
| WS-19 | Seed script (2 clients, all roles) | WS-13 | done ([evidence](evidence/skeleton/WS-19.md)) |
| WS-20 | Finalize ADR-006 + deploy pipeline to KSA host | WS-09 | in progress — ADR-006 **rev. 4: interim staging on AWS UAE** (no-production-data guard, [guide](docs/PROVISIONING-AWS.md)); KSA cutover tracked follow-up |
| WS-21 | Backups + restore test | WS-20 | todo |
| WS-22 | Skeleton exit review (evidence walkthrough) | WS-01…WS-21 | done with recorded gaps ([review](evidence/skeleton/WS-22-exit-review.md)) — WS-20/21 remain open, external-blocked |

---

## Task cards

### WS-01 — Initialize repository
- **Objective:** turn this directory into a version-controlled repository with the frozen architecture docs as the first commit, so every subsequent change is reviewable history.
- **Files:** `.gitignore`, `README.md` (new); first commits include existing `architecture.md`, `ACTION-PLAN.md`, `ARCHITECTURE-REVIEW.md`, `SPIKE-001-rls-prisma-pooling.md`, `BACKLOG.md`, `adr/*`.
- **Definition of done:** `git log` shows an initial docs commit on `main`; `.gitignore` covers Node/Next/Prisma/env artifacts; `README.md` states what the project is and links architecture, backlog, ADR index; working tree clean.
- **Evidence:** `git log --oneline` output; `git status` showing clean tree; README content.
- **Dependencies:** none.
- **Risks:** committing secrets or junk files later because `.gitignore` was incomplete from the start — mitigated by writing it now, before any tooling exists; `.env*` ignored from day one.

### WS-02 — Monorepo scaffolding
- **Objective:** pnpm workspaces + Turborepo shell that all later tasks slot into (ADR-003/008 structure).
- **Files:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc` (or `engines`), empty `apps/` and `packages/` with placeholder `.gitkeep`.
- **Definition of done:** `pnpm install` succeeds from clean clone; `pnpm turbo run build` runs (no-op) across the empty workspace; workspace globs match `apps/*`, `packages/*`.
- **Evidence:** command output of clean-clone install + turbo run.
- **Dependencies:** WS-01.
- **Risks:** version drift (Node/pnpm) across machines — pinned via `.nvmrc` + `packageManager` field now.

### WS-03 — Shared config package
- **Objective:** one source of truth for tsconfig/eslint/prettier so all packages inherit identical rules (prerequisite for WS-08 lint enforcement).
- **Files:** `packages/config/` (package.json, `tsconfig.base.json`, eslint base config, prettier config).
- **Definition of done:** a throwaway consumer package extends the base tsconfig and lints with the shared config successfully; strict TypeScript on.
- **Evidence:** lint/typecheck run output from the consumer.
- **Dependencies:** WS-02.
- **Risks:** baking in lint decisions that fight NestJS/Next defaults — kept minimal here; boundary/RTL rules arrive in WS-08 where they're proven.

### WS-04 — Shared contracts package
- **Objective:** `packages/contracts` with Zod as the single home for request/response schemas (ADR-007), proven by one example schema.
- **Files:** `packages/contracts/` (package.json, tsconfig, `src/index.ts`, one example schema + inferred type).
- **Definition of done:** package builds; example schema exports both runtime validator and inferred TS type; unit test validates a good and a bad payload.
- **Evidence:** test output.
- **Dependencies:** WS-03.
- **Risks:** none significant; the risk lives downstream (schemas defined outside this package — guarded by review rule).

### WS-05 — NestJS API scaffold
- **Objective:** bootable API app with health/readiness endpoints (deploy-gate prerequisite), consuming the shared config.
- **Files:** `apps/api/` (Nest app shell, `main.ts`, app module, health module, package/tsconfig wiring).
- **Definition of done:** `pnpm --filter api dev` serves `/health` and `/ready` returning 200 with build info; app consumes `packages/config`; one passing e2e test hitting `/health`.
- **Evidence:** e2e test output; curl output of both endpoints.
- **Dependencies:** WS-03.
- **Risks:** health endpoints must bypass the future auth guard (WS-15) — noted in code placement now so WS-15 doesn't break liveness.

### WS-06 — Next.js web scaffold
- **Objective:** bootable web app consuming shared config, structured for the App Router with an ar/en route foundation to be filled by WS-16.
- **Files:** `apps/web/` (Next app shell, Tailwind wired with logical-properties usage, one placeholder page).
- **Definition of done:** `pnpm --filter web dev` renders the placeholder page; production build succeeds; Tailwind configured; page consumes the WS-04 example type to prove cross-package types flow.
- **Evidence:** build output; screenshot of placeholder page.
- **Dependencies:** WS-03 (WS-04 for the type import).
- **Risks:** Next/Tailwind versions moving fast — pin exact versions; no UI investment here (shadcn arrives with i18n/RTL in WS-16 where RTL verification happens).

### WS-07 — Module skeleton + example module
- **Objective:** make "module" concrete per ADR-003: directory layout, single `public-api.ts`, module-prefixed table naming convention documented, one example module (`example/`) demonstrating the shape.
- **Files:** `apps/api/src/modules/example/` (layout dirs, `public-api.ts`, one service, one controller); `apps/api/src/modules/README.md` documenting the layout.
- **Definition of done:** example module serves one endpoint through its public API; a second dummy module consumes the example module **only** via `public-api.ts`; layout README matches ADR-003.
- **Evidence:** endpoint test output; import graph snippet showing the public-api-only consumption.
- **Dependencies:** WS-05.
- **Risks:** over-engineering the layout before real modules exist — keep the skeleton minimal; ADR-003 confirms (Proposed → Accepted) after this task proves the shape.

### WS-08 — Boundary + RTL lint enforcement
- **Objective:** make the two architecture slogans mechanically enforced: no imports bypassing `public-api.ts`; no physical `left/right` Tailwind utilities.
- **Files:** eslint config in `packages/config` (boundaries plugin rules, Tailwind physical-property rule), wiring in `apps/api` and `apps/web`.
- **Definition of done:** a deliberate violation of each rule fails lint locally; the passing codebase lints clean.
- **Evidence:** lint output of both deliberate failures and the clean run.
- **Dependencies:** WS-07, WS-06.
- **Risks:** false positives strangling velocity — rules scoped precisely (boundaries rule targets `modules/*` internals; RTL rule targets the known physical utility list).

### WS-09 — CI pipeline
- **Objective:** GitHub Actions running install → lint → typecheck → test → build on every PR; red on any failure.
- **Files:** `.github/workflows/ci.yml`; branch protection note in README.
- **Definition of done:** green run on main; a deliberately-bad PR (boundary violation) runs red with the lint error visible in the log — this PR is kept open/linked as the standing proof (DoD 1.2 evidence).
- **Evidence:** green run URL; red run URL of the bad PR.
- **Dependencies:** WS-08.
- **Risks:** CI runtime creeping up as the workspace grows — Turborepo caching wired from the start.

### WS-10 — Local dev stack
- **Objective:** one-command local Postgres + Redis matching production versions.
- **Files:** `docker-compose.yml`, `.env.example`.
- **Definition of done:** `docker compose up` yields healthy Postgres and Redis; connection strings documented in `.env.example`; volumes persist across restarts.
- **Evidence:** `docker compose ps` output showing healthy services.
- **Dependencies:** WS-01.
- **Risks:** version mismatch with the (undecided, ADR-006) managed offering — pin conservative LTS versions now; revisit at WS-20.

### WS-11 — Prisma setup + migration workflow
- **Objective:** Prisma wired to local Postgres with the migration workflow (including raw-SQL migration capability needed for RLS later); one throwaway table proves the loop.
- **Files:** `apps/api/prisma/` (schema, first migration), db scripts in package.json, generated client wiring.
- **Definition of done:** `prisma migrate dev` and `prisma migrate deploy` both work; a raw-SQL migration (comment-only) demonstrates the escape hatch; API reads/writes the throwaway table in an e2e test.
- **Evidence:** migration run logs; e2e test output.
- **Dependencies:** WS-10, WS-05.
- **Risks:** none serious yet — this is deliberately before RLS so WS-12 experiments on a working baseline.

### WS-12 — Execute SPIKE-001
- **Objective:** run the spike exactly as specified in `SPIKE-001-rls-prisma-pooling.md`: validate the two-role + transaction-local `set_config` pattern against success criteria S1–S7.
- **Files:** `spikes/001-rls/` (isolated — throwaway by contract; nothing imports from it).
- **Definition of done:** all nine test scenarios executed; S1–S7 each explicitly pass/fail; benchmark numbers recorded; ADR-001 updated to **Accepted** (or the fallback path per spike exit conditions).
- **Evidence:** spike test output, soak results, benchmark table in the spike repo README; ADR-001 status change commit.
- **Dependencies:** WS-11.
- **Risks:** the central architectural risk of the project — that's why it's a timeboxed spike (4 days) with defined exit conditions rather than discovered during module development.

### WS-13 — Production RLS pattern
- **Objective:** port the validated spike pattern into production code: `app_staff`/`app_client` roles, fail-closed policies, Prisma client extension, policy SQL template for future tables.
- **Files:** Prisma raw-SQL migrations (roles, policies on the example module's table), `apps/api/src/` db client extension + per-request client selection.
- **Definition of done:** the example module's table enforces RLS for client sessions (scenario tests 1–8 from the spike pass against production code); policy template documented for use by every future client-scoped table.
- **Evidence:** test output; migration log against a fresh DB (DoD 1.5 evidence).
- **Dependencies:** WS-12 (blocked until ADR-001 is Accepted).
- **Risks:** subtle divergence between spike code and production port — mitigated by porting the spike's test scenarios, not just its implementation.

### WS-14 — Request context + structured logging
- **Objective:** every request carries an ID, actor, and client scope through async context; every log line is JSON with those fields (DoD 1.3).
- **Files:** `apps/api/src/` (request-context middleware using AsyncLocalStorage, logger setup, interceptor wiring).
- **Definition of done:** one request traceable end-to-end by request ID across all its log lines; context available anywhere without parameter threading.
- **Evidence:** pasted log excerpt tracing a single request ID.
- **Dependencies:** WS-05.
- **Risks:** AsyncLocalStorage context loss across queue boundaries — out of scope here (BullMQ arrives post-skeleton); flagged for that future task.

### WS-15 — Deny-by-default authorization guard
- **Objective:** global NestJS guard rejecting any endpoint without explicit permission metadata (ADR-002); health endpoints explicitly public.
- **Files:** `apps/api/src/` (guard, permission decorator, wiring in app module; example module endpoints annotated).
- **Definition of done:** an endpoint with no metadata returns 403 in a test (the "forgot the guard" proof); annotated endpoints pass; `/health` remains public via explicit `@Public()`.
- **Evidence:** test output for all three cases (DoD 1.3 evidence).
- **Dependencies:** WS-14.
- **Risks:** full RBAC (roles, catalog, policy service) does NOT belong here — this task is only the deny-by-default mechanism; scope creep into Priority 2's auth module is the risk to resist.

### WS-16 — i18n scaffold
- **Objective:** ar/en with runtime switching, RTL layout flip, zero hardcoded strings, shadcn/ui RTL verification (DoD 1.4).
- **Files:** `apps/web/` (i18n library wiring, locale files, direction-aware root layout, one real page using logical utilities; shadcn setup + shortlist components).
- **Definition of done:** same page renders correctly in ar (RTL) and en (LTR) switched at runtime; string extraction proven (no literals in the page); shortlisted shadcn components verified in RTL with a recorded pass/fail list.
- **Evidence:** side-by-side screenshots; RTL component checklist; lint/grep proof of externalized strings.
- **Dependencies:** WS-06.
- **Risks:** a shadcn component failing RTL late — that's why verification of the shortlist happens here, before any real screens exist.

### WS-17 — Hijri/Gregorian date utility
- **Objective:** the single shared utility (ADR-005 invariant): store Gregorian UTC, render/parse Hijri (Umm al-Qura), owned by Configuration-layer code in `packages/`.
- **Files:** `packages/contracts` or a small `packages/dates` (utility, tests with known conversion fixtures).
- **Definition of done:** round-trip tests pass against known Umm al-Qura fixture dates (including edge months); API and web both import the same utility.
- **Evidence:** unit test output with fixture table (DoD 1.4 evidence).
- **Dependencies:** WS-04.
- **Risks:** subtle Umm al-Qura vs. tabular-Hijri discrepancies — fixtures taken from official Saudi calendar dates, not computed assumptions.

### WS-18 — Cross-client isolation test harness
- **Objective:** the CI suite that probes every registered endpoint as wrong-client principals and fails on any leak; unregistered endpoints fail CI (DoD 1.6).
- **Files:** `apps/api/test/isolation/` (harness, endpoint registry check, wiring into CI).
- **Definition of done:** harness green against the example module; a demo commit adding an unregistered endpoint turns CI red; both linked.
- **Evidence:** green run URL with test counts; red run URL of the demo commit.
- **Dependencies:** WS-13, WS-15, WS-09.
- **Risks:** harness becoming a rubber stamp (probing only happy paths) — registry requires each endpoint to declare its scoped resources so probes are generated, not hand-written.

### WS-19 — Seed script
- **Objective:** deterministic seed: 2 client companies, one staff user per role, one client-rep per client — the fixture base for the harness and manual testing.
- **Files:** `apps/api/prisma/seed.ts`, package script.
- **Definition of done:** seed runs idempotently against a fresh and an already-seeded DB; harness (WS-18) consumes seeded principals.
- **Evidence:** seed run log (fresh + repeat).
- **Dependencies:** WS-13.
- **Risks:** seeded credentials leaking toward production — seed guarded to refuse non-development environments.

### WS-20 — Finalize ADR-006 + deploy pipeline
- **Objective:** complete the provider evaluation, record the decision in ADR-006, provision the KSA environment (managed Postgres/Redis/storage), and make merge-to-main deploy with migrations (DoD 1.2).
- **Files:** ADR-006 (evaluation table + decision), `.github/workflows/deploy.yml`, infra config as applicable.
- **Definition of done:** ADR-006 Accepted with criteria table filled; green deploy run to KSA host; app serves `/health` publicly from the KSA environment; one deliberate rollback performed.
- **Evidence:** ADR-006 diff; deploy run URL; rollback run URL + version log excerpt.
- **Dependencies:** WS-09 (CI green first). *Evaluation work can start in parallel anytime — only the deploy depends on prior tasks.*
- **Risks:** the largest external dependency (account setup, provider paperwork can take days) — start the evaluation early even while WS-02…WS-19 proceed; if managed Postgres is unavailable at the chosen provider, ADR-006 consequences trigger (reconsider provider before accepting self-managed DB).

### WS-21 — Backups + restore test
- **Objective:** automated backups live in KSA; one real restore proves them; RPO/RTO recorded (DoD 1.7).
- **Files:** provider backup config; ADR-006 RPO/RTO section; `evidence/skeleton/WS-21.md`.
- **Definition of done:** schedule active; restore into scratch environment executed; restored app boots and serves `/health`; measured restore time recorded as the actual RTO.
- **Evidence:** backup config screenshot; restore log with timestamps; health output against restored DB.
- **Dependencies:** WS-20.
- **Risks:** restore tested once and never again — post-skeleton, a recurring restore-test task goes on the ops calendar (flagged for Priority 2 backlog).

### WS-22 — Skeleton exit review
- **Objective:** the formal gate to Priority 2: walk `evidence/skeleton/` end-to-end against the DoD checklists in `ACTION-PLAN.md`; demonstrate the full slice (browser → RTL page → authenticated API → RLS-scoped query → structured log, deployed in KSA).
- **Files:** `evidence/skeleton/WS-22-exit-review.md` (findings, open items, sign-off).
- **Definition of done:** every DoD box has linked evidence; the end-to-end slice demonstrated live; any gaps become explicit backlog items before sign-off.
- **Evidence:** the review document itself.
- **Dependencies:** WS-01…WS-21.
- **Risks:** review theater — the rule stands: any box without evidence is open, regardless of who says otherwise.

---

## Priority 2 — Authentication epic (ACTION-PLAN 2.1/2.2, ADR-002)

Same rules, same loop. Evidence goes to `evidence/auth/AUTH-XX.md`.

| ID | Task | Depends on | Status |
|---|---|---|---|
| AUTH-01 | Auth module + users table + migration | skeleton | done ([evidence](evidence/auth/AUTH-01.md)) |
| AUTH-02 | Password hashing + login endpoint + Redis sessions | AUTH-01 | done ([evidence](evidence/auth/AUTH-02.md)) |
| AUTH-03 | Session guard: actor into request context, 401 semantics | AUTH-02 | done ([evidence](evidence/auth/AUTH-03.md)) |
| AUTH-04 | Permission catalog + role mapping + policy service (fills the guard seam) | AUTH-03 | done ([evidence](evidence/auth/AUTH-04.md)) |
| AUTH-05 | Logout + session revocation + TTL policy | AUTH-02 | done ([evidence](evidence/auth/AUTH-05.md)) |
| AUTH-06 | MFA (TOTP) — required for admin roles | AUTH-02 | done ([evidence](evidence/auth/AUTH-06.md)) |
| AUTH-07 | Role/user seeding + harness update (staff endpoints → 401 unauthenticated) | AUTH-04 | done ([evidence](evidence/auth/AUTH-07.md)) |
| AUTH-08 | `GET /auth/me` (actor + capabilities) + web SessionProvider route guard + role-aware UI/landing | AUTH-04, AUDIT/CLIENT UI | done ([evidence](evidence/auth/AUTH-08.md)) |

### AUTH-01 — Auth module + users table
- **Objective:** the `auth` module (ADR-003 layout) owning the user identity model: staff and client-rep principals in one table per ADR-002 (`principal_type`, nullable `client_id` binding for client reps), statuses, unique email.
- **Files:** `apps/api/src/modules/auth/` (module, domain types, `public-api.ts`), Prisma schema `auth_users` model + migration. **Design note:** `auth_users` is a *system* table (staff users have no client), so it gets `app_staff` grants only — client-rep rows are readable by the auth flow (staff-path service), never by the `app_client` DB role; documented in the migration.
- **DoD:** migration applies to fresh DB; model + module compile; boundary lint green; endpoint registry untouched (no endpoints yet); e2e smoke: service creates/reads a user via staff path.
- **Evidence:** migration log + test output → `evidence/auth/AUTH-01.md`.
- **Dependencies:** skeleton. **Risks:** schema decisions here ripple (password hash column sized for argon2; `mfa_secret` nullable now to avoid an AUTH-06 migration churn — included but unused).

### AUTH-02 — Login + sessions
- **Objective:** `POST /auth/login` (contracts-validated), argon2 password verify, server-side session in Redis (httpOnly, SameSite=Lax cookie, TTL), per ADR-002/ADR-008 (Redis never source of truth — sessions are revocable cache).
- **Files:** auth module application/api layers; Redis client wiring (first runtime Redis use — REDIS_URL, local 6380); `@hr/contracts` login schemas; cookie config.
- **DoD:** e2e: valid login sets cookie + creates session; wrong password → 401 with no user-enumeration leak; rate-limit note recorded (throttler arrives with ADR-007 work); lint/typecheck/tests green.
- **Evidence:** e2e output + Redis session inspection → `evidence/auth/AUTH-02.md`.
- **Dependencies:** AUTH-01. **Risks:** ElastiCache still deferred in staging — local Redis only until WS-20 completes (flagged in HANDOFF).

### AUTH-03 — Session guard + request context
- **Objective:** authenticated requests resolve the actor (id, principal type, client binding) from the session cookie into the WS-14 request context; unauthenticated requests to non-`@Public` endpoints → **401** (guard's deny-by-default 403 stays for missing metadata).
- **Files:** auth session middleware/guard; `PermissionsGuard` seam update; logging now carries real `actorId`/`clientId`.
- **DoD:** e2e: no cookie → 401; valid session → 200 with actorId in logs; client-rep session → `clientId` set in context (feeds `ScopedPrismaService` selection); isolation harness updated expectations green.
- **Evidence:** `evidence/auth/AUTH-03.md`.
- **Dependencies:** AUTH-02. **Risks:** ordering with context middleware — session resolution must run after context creation (same pattern as harness's test middleware).

### AUTH-04 — Permission catalog + policy service
- **Objective:** the ADR-002 core: catalog of `resource.action` permissions (seeded from the architecture matrix), static role→permission mapping, `PolicyService.can(actor, permission)`; `PermissionsGuard` finally delegates instead of allow-listing.
- **Files:** auth module (catalog constants typed against the naming convention, role map, policy service); guard update; matrix cross-check test (catalog ⊇ every `@RequirePermission` in the codebase — registry-style coverage).
- **DoD:** e2e per role class: staff role with permission → 200, without → 403; client-rep hitting staff-only endpoint → 403; coverage test fails on an undeclared permission (red-path proven, reverted).
- **Evidence:** `evidence/auth/AUTH-04.md`.
- **Dependencies:** AUTH-03. **Risks:** matrix drift vs architecture.md — the cross-check test is the mechanism.

### AUTH-05 — Logout + revocation · AUTH-06 — MFA (TOTP) · AUTH-07 — Seeding + harness
Cards detailed at their gates (objective summaries in the status board; scope per ACTION-PLAN 2.1).

## Priority 2 — Audit Logs epic (ACTION-PLAN 2.3, architecture.md Shared Modules)

Same rules, same loop. Evidence goes to `evidence/audit/AUDIT-XX.md`. Audit must
exist before the first business mutation (architecture.md phasing). Write
mechanism is **synchronous + transactional** (ADR-004 hardening; owner-approved
2026-07-21) — audit rows are written inside the caller's transaction, not via
the outbox, which stays reserved for cross-module async effects.

| ID | Task | Depends on | Status |
|---|---|---|---|
| AUDIT-01 | Audit module + append-only `aud_entries` table (SELECT/INSERT grants only) + transactional write API | AUTH epic | done ([evidence](evidence/audit/AUDIT-01.md)) |
| AUDIT-02 | Client-rep audit write path: `app_client` INSERT grant + RLS `WITH CHECK` (own-client only; still no read/update/delete) | AUDIT-01 | done ([evidence](evidence/audit/AUDIT-02.md)) |
| AUDIT-03 | Automatic mutation logging (actor/client/before-after) composed with the scoped `set_config` tx, proven on a write path | AUDIT-02 | done ([evidence](evidence/audit/AUDIT-03.md)) |
| AUDIT-04 | `audit.read` permission + read/filter API, gated to System/Company Admin only; register in isolation harness | AUDIT-03 | done ([evidence](evidence/audit/AUDIT-04.md)) |
| AUDIT-05 | Admin read UI (Next.js, ar/en + RTL) over the audit read API — incl. login + MFA + app shell | AUDIT-04 | done ([evidence](evidence/audit/AUDIT-05.md)) |

> **AUDIT-02 split note (2026-07-21):** the original AUDIT-02 bundled the
> client-rep write grant with the automatic-logging mechanism. Split because the
> mechanism is a data-layer design (before-image capture, composing with the
> scoped `set_config` transaction) with no real write path to prove it on yet;
> the grant is small and testable now. Grant → AUDIT-02; mechanism → AUDIT-03;
> read API → AUDIT-04; UI → AUDIT-05.

### AUDIT-01 — Audit module + append-only table + transactional write API
- **Objective:** stand up the `audit` module (ADR-003 layout) owning an
  append-only `aud_entries` table, with `AuditService.record(tx, input)` that
  records `{actor, client scope, resource, action, before, after, requestId}`
  **inside the caller's transaction** — the foundation every mutation calls.
- **Files:** `apps/api/src/modules/audit/` (module, `public-api.ts`,
  `application/audit.service.ts`, `domain/audit-entry.ts`); Prisma `AuditEntry`
  model + migration `20260721154941_audit_entries` (table + append-only grants).
- **DoD:** migration applies to fresh DB; grant check proves no role holds
  UPDATE/DELETE; commit + rollback atomicity both proven; append-only enforced
  at the grant (runtime UPDATE/DELETE → permission denied); suite + lint green;
  endpoint registry untouched (no endpoints yet).
- **Evidence:** `evidence/audit/AUDIT-01.md`.
- **Dependencies:** AUTH epic (done). **Risks:** `before/after` capturing
  sensitive fields — redaction is AUDIT-03; read path already SysAdmin/CompanyAdmin-only.

### AUDIT-02 — Client-rep audit write path (grant + RLS)
- **Objective:** make `aud_entries` writable by the client-representative DB
  role (`app_client`) but only for the rep's own client, while it stays
  unreadable/unmodifiable to that role — extending AUDIT-01's write path from
  `app_staff` to `app_client` so client-rep mutations can be audited in AUDIT-03.
- **Files:** Prisma raw-SQL migration — `GRANT INSERT ON aud_entries TO
  app_client`; `ENABLE ROW LEVEL SECURITY`; `staff_full_access` (`FOR ALL TO
  app_staff USING(true) WITH CHECK(true)`) + `client_insert` (`FOR INSERT TO
  app_client WITH CHECK (client_id = NULLIF(current_setting('app.client_id',
  true), '')::uuid)`).
- **DoD:** migration applies; `app_client` INSERT with own `client_id` (in a
  `set_config` tx) succeeds, with another client's id → RLS rejects;
  `app_client` SELECT/UPDATE/DELETE → denied; `app_staff` unaffected (AUDIT-01
  tests green); suite + lint green; registry untouched.
- **Evidence:** migration log; per-role grant/RLS probe matrix → `evidence/audit/AUDIT-02.md`.
- **Dependencies:** AUDIT-01. **Risks:** Prisma `.create()` emits `RETURNING`
  which needs SELECT — the client-rep write must use raw `INSERT` without
  `RETURNING` (finding recorded in AUDIT-02 evidence, applied in AUDIT-03);
  enabling RLS makes `app_staff` policy-subject → permissive staff policy
  mandatory; NULLIF load-bearing (SPIKE-001).

### AUDIT-03 — Automatic mutation logging (write path)
- **Mechanism (owner-deferred to recommendation):** explicit `AuditService.
  record()` at the write site in the mutation's transaction, enforced by a CI
  coverage test (`test/audit/audited-writes.ts` — every mutating route is
  audited-or-exempt, else red). Satisfies "every mutation logged" via CI, not
  interception.
- **Files:** `ScopedPrismaService.transaction()` (interactive scoped tx);
  `AuditService.record()` unified on raw `INSERT` (no RETURNING); `POST
  /scope-check` write + `scope-check.create` permission; `client-write` scope
  class + registration in the isolation harness; `test/audit/audited-writes.ts`
  + `write-coverage.e2e-spec.ts`; module README checklist item 5.
- **DoD:** row + audit committed atomically on a real write path; rollback
  rolls both back; RLS bars cross-client writes; can't-forget coverage RED on
  an undeclared write (proven, reverted); harness + suite + lint green.
- **Evidence:** `evidence/audit/AUDIT-03.md`.
- **Dependencies:** AUDIT-02. **Risks:** `before/after` redaction of sensitive
  fields deferred to the first module writing them; auth-event audit (login/
  MFA) is a separate stream, exempted with reasons now.

### AUDIT-04 — Audit read API (admin-only)
- **Objective:** `audit.read` permission (System/Company Admin only) + `GET
  /audit` read/filter/paginate API over `aud_entries`, for the AUDIT-05 UI.
- **Files:** `@hr/contracts` audit schemas; `audit/api/audit.controller.ts` +
  `application/audit-query.service.ts`; `audit.read` in the permission catalog
  (`ADMIN_STAFF`); `GET /audit` registered `staff` in the isolation harness;
  `loginAsEnrolledStaff()` test helper.
- **DoD:** both admins → 200, other staff/client → 403, unauth → 401; filters
  (resource/action/actor/client/time) + cursor pagination; BigInt id as string;
  catalog + isolation coverage green; suite + lint green.
- **Evidence:** `evidence/audit/AUDIT-04.md`.
- **Dependencies:** AUDIT-03. **Risks:** admin roles are MFA-required (tests
  enroll via the new helper); BigInt has no JSON form (serialized as string).

### AUDIT-05 — First UI: login + app shell + audit viewer
- **Objective:** the first product UI — an admin audit viewer over `GET /audit`,
  reachable through a real login (incl. the admin MFA flow) inside an app shell.
- **Files:** `next.config.ts` `/api/*` proxy; `lib/api.ts`; `[locale]/login`
  (login + MFA enroll/challenge); `[locale]/(app)/layout.tsx` shell +
  `sign-out-button.tsx`; `[locale]/(app)/audit` viewer; `auth`/`nav`/`audit`
  i18n namespaces (ar+en).
- **DoD:** login→MFA→audit works end-to-end (verified in-browser with a real
  TOTP); viewer shows real pipeline-generated entries; ar/en + RTL; 401→login;
  lint (RTL rule)/typecheck/test/build green.
- **Evidence:** `evidence/audit/AUDIT-05.md`.
- **Dependencies:** AUDIT-04. **Deferred (stated in evidence):** TanStack Query
  (plain fetch for now), QR for MFA enroll, server-side route guard (`/auth/me`).

## Priority 2 — Clients module epic (ACTION-PLAN 2.5, architecture.md)

Same rules, same loop. Evidence goes to `evidence/clients/CLIENT-XX.md`. The
first real business module: it originates `client_id` (the isolation boundary).
Resources `client` (staff CRUD, reps R own) and `client-user` (Client Admin
CRUD own). Bilingual names (ADR-005). Depends on Auth + Authz + Audit (done).

| ID | Task | Depends on | Status |
|---|---|---|---|
| CLIENT-01 | Clients module + `cli_clients` registry (bilingual, status) + RLS (staff full; rep reads own, keyed on the PK) + `ClientsService` + seed the two companies | Auth/Audit | done ([evidence](evidence/clients/CLIENT-01.md)) |
| CLIENT-02 | Client management API (staff): `client.*` endpoints, audited (AUDIT-03), isolation-harness + audited-writes registration, contracts | CLIENT-01 | done ([evidence](evidence/clients/CLIENT-02.md)) |
| CLIENT-03 | Client portal users: Client Admin invites Client Users → `client_rep` auth_users bound to the client (app-layer, no cross-module FK); client-scoped + audited | CLIENT-02 | done ([evidence](evidence/clients/CLIENT-03.md)) |
| CLIENT-04 | Web UI: clients list + create/edit in the console (staff), ar/en + RTL, over the API | CLIENT-02 | done ([evidence](evidence/clients/CLIENT-04.md)) |

> **Scope note (CLIENT-03):** the client-rep "read own company" endpoint —
> earlier slated for CLIENT-03 — moved to the **Client Portal epic (5.1)**: it
> needs `GET /clients` to become principal-aware + `client.read` granted to
> reps, a delivery-surface concern better built with the portal.

### CLIENT-01 — Clients module + registry + RLS + service
- **Objective:** the authoritative client-company registry (`cli_clients`) that
  originates `client_id`, with staff-full / rep-read-own RLS and a
  `ClientsService`, plus the two seed companies.
- **Files:** `apps/api/src/modules/clients/` (module, `public-api.ts`,
  `application/clients.service.ts`, `domain/client.ts`); Prisma `Client` model +
  migration `20260721173628_clients` (grants + RLS); `prisma/seed.ts` client seed.
- **Design note:** RLS scope key is the row's **own PK** (a client *is* the
  client — no denormalized `client_id` column); no cross-module FK from
  `auth_users`.
- **DoD:** migration applies; grant/RLS matrix (staff CRUD, rep SELECT-own-only,
  no rep writes); service create/list/get; seed idempotent with the seed ids;
  suite + lint green; registry untouched (endpoints are CLIENT-02).
- **Evidence:** `evidence/clients/CLIENT-01.md`.
- **Dependencies:** Auth + Audit epics (done). **Risks:** PK-as-scope-key
  variation (documented in the migration); NULLIF load-bearing (SPIKE-001).

### CLIENT-02 — Client management API (staff)
- **Objective:** staff CRUD over `cli_clients` — `GET/POST/PATCH/DELETE
  /clients` — audited, permission-gated per the matrix (all staff read; admins
  create/update/archive), `DELETE` = soft-archive.
- **Files:** `clients/api/clients.controller.ts`; `ClientsService` mutations
  refactored to transactional + audited; `@hr/contracts` client request/response
  schemas; `client.*` in the permission catalog (`ALL_STAFF` read, `ADMIN_STAFF`
  CUD); 5 routes in the isolation harness (`staff`); 3 mutations in audited-writes.
- **DoD:** authorization matrix; CRUD + response shape; soft-archive; mutations
  audited (create/update/archive) scoped to the client; 404/400; all coverage
  gates + suite + lint green.
- **Evidence:** `evidence/clients/CLIENT-02.md`.
- **Dependencies:** CLIENT-01. **Risks:** granting reps `client.read` before the
  scoped rep endpoint exists would leak the staff list — deferred to CLIENT-03.

### CLIENT-03 — Client portal user management
- **Objective:** a Client Admin manages the `client_rep` users of its own
  client — invite/list/get/update/deactivate — client-scoped and audited.
- **Files:** `clients/api/client-users.controller.ts` +
  `application/client-users.service.ts`; auth `UsersService` scoped/tx-aware
  methods (`listClientReps`/`findClientRep`/`updateClientRep`); `client-user.*`
  in the catalog (Client Admin only); `@hr/contracts` client-user schemas; new
  `client-read` harness class + registrations; audited-writes.
- **Design note:** `auth_users` is app-scoped (no RLS); isolation is
  application-enforced — every query filtered by the caller's context clientId,
  never request input. Cross-client → 404. Soft-deactivate only.
- **DoD:** invite + scoped list/get; cross-client isolation (404); update/
  deactivate; permission matrix (Client User 403, staff 403, unauth 401);
  duplicate email 400; mutations audited; all coverage gates + suite + lint green.
- **Evidence:** `evidence/clients/CLIENT-03.md`.
- **Dependencies:** CLIENT-02. **Risks:** app-enforced scoping must be airtight
  (context clientId only) — covered by the isolation test; invite-token/email
  flow deferred to Notifications (Priority 3).

### CLIENT-04 — Clients console UI (staff)
- **Objective:** the staff clients console — list + create/edit/archive over
  the `client.*` API — the second product screen, inside the AUDIT-05 shell.
- **Files:** `web/app/[locale]/(app)/clients/page.tsx`; sidebar Clients nav
  link; `clients` + `nav.clients` i18n (ar+en).
- **DoD:** list from API; create/edit dialog (bilingual name + status);
  soft-archive; localized names; ar/en + RTL; 401→login; web lint (RTL rule)/
  typecheck/build green. Verified end-to-end in the browser.
- **Evidence:** `evidence/clients/CLIENT-04.md`.
- **Dependencies:** CLIENT-02. **Deferred (in evidence):** role-aware UI (hide
  admin-only actions) + server route guard pending `/auth/me`; TanStack Query;
  client-users management UI.

## Priority 3 — Employees module epic (ACTION-PLAN 3.1, architecture.md)

Same rules, same loop. Evidence goes to `evidence/employees/EMP-XX.md`. The
domain core — "the gravitational center of the domain." Client-scoped (standard
`client_id` RLS). Three permission-gated field groups (`employee`/`salary`/
`govdata`) with field-level sensitivity; bilingual names; Hijri-rendered dates.
Built from the 0.8 field mapping. Depends on Clients (done) + 0.8 (done).

| ID | Task | Depends on | Status |
|---|---|---|---|
| 0.8 | Reference-system field-mapping doc — the schema's source of truth | — | done ([doc](docs/FIELD-MAPPING.md)) |
| EMP-01 | Employees module + `emp_employees` table (client-scoped RLS) from the mapping + `EmployeesService` + seed | Clients, 0.8 | done ([evidence](evidence/employees/EMP-01.md)) |
| EMP-02 | Employees HTTP API + **field-level authorization** (`salary`/`govdata` redacted per capability; rep govdata = expiry/status only) + audited + harness | EMP-01 | done ([evidence](evidence/employees/EMP-02.md)) |
| EMP-03 | Web UI: employees list + detail/edit (staff), ar/en + RTL, Hijri dates | EMP-02 | done ([evidence](evidence/employees/EMP-03.md)) |

### 0.8 — Reference-system field mapping (doc)
- **Objective:** author `docs/FIELD-MAPPING.md` — the exact Employee fields/enums
  per reference system, tagged by sensitivity group (`core`/`salary`/`govdata:id`
  /`govdata:status`), manual-entry v1 + connector-ready. The source EMP-01 builds
  from.
- **Files:** `docs/FIELD-MAPPING.md`; `ACTION-PLAN.md` 0.8 → done; CLAUDE.md map.
- **DoD:** every in-scope system (Qiwa/GOSI/Muqeem/Mudad/Absher) has its
  Employee fields + enums; each tagged by sensitivity + rep visibility; Hijri
  date fields marked; ZATCA deferred to Billing; no code.
- **Evidence:** the doc itself. **Done.**

### EMP-01 — Employees module + registry + RLS + service
- **Objective:** the `emp_employees` domain-core table (built from 0.8), all
  sensitivity groups as columns, client-scoped via standard `client_id` RLS, +
  `EmployeesService` (staff path) + seed employees.
- **Files:** `apps/api/src/modules/employees/`; Prisma `Employee` model + 7
  enums + migration `20260721184243_employees` (grants + RLS); `prisma/seed.ts`
  employees.
- **Design note:** standard `client_id`-column RLS (staff full; rep SELECT-own);
  field-level authorization deferred to EMP-02; no cross-module FK.
- **DoD:** migration applies; grant/RLS matrix (staff CRUD, rep SELECT-own-only,
  no rep writes); service create/list/get round-trips core+salary+govdata; seed
  idempotent; suite + lint green; registry untouched.
- **Evidence:** `evidence/employees/EMP-01.md`.
- **Dependencies:** Clients, 0.8 (done). **Risks:** many nullable v1 fields;
  enums must match the doc; NULLIF load-bearing (SPIKE-001).

### EMP-02 — Employees API + field-level authorization
- **Objective:** the employee HTTP API where the policy service gates FIELDS
  (salary/govdata) not just endpoints — reads redact groups per capability;
  each group's write is its own sub-resource endpoint.
- **Files:** `employees/api/employees.controller.ts` (redaction mapper +
  write-gating); `EmployeesService` transactional+audited update; `@hr/contracts`
  employee schemas (nested nullable groups); `ROLE_PERMISSIONS` restructured to
  per-role sets + `employee/salary/govdata.*` in the catalog; 7 routes in the
  isolation harness; 5 mutations in audited-writes.
- **DoD:** redaction per role; write-gating per group; soft-terminate; mutations
  audited with NO sensitive values; client_id validated; all coverage gates +
  suite + lint green.
- **Evidence:** `evidence/employees/EMP-02.md`.
- **Dependencies:** EMP-01. **Risks:** per-role permission restructure could
  regress auth tests (it didn't — auth-policy/auth-me green); sub-resource
  endpoints chosen so Finance/GRO can write their group without employee.update.

### EMP-03 — Employees web UI (list + detail/edit)
- **Objective:** the staff employees console — a list + a detail/edit view where
  the SAME server-side field redaction (null `salary`/`govdata` per capability)
  drives what the screen shows, and `useCan` gates every edit affordance.
- **Files:** `(app)/employees/page.tsx` (list + core-only create dialog);
  `(app)/employees/[id]/page.tsx` (three group cards + per-group edit dialogs +
  terminate); `lib/employee-format.ts` (dual-calendar dates + enum-label maps);
  `app-shell.tsx` (`employee.read`-gated nav); `messages/{en,ar}.json`
  (`nav.employees` + `employees` namespace).
- **DoD:** list core columns + Hijri hire date; detail shows a group only when
  the API returns it (else a 🔒 restricted notice); edits gated core→employee.update,
  salary→salary.update, govdata→govdata.update, terminate→employee.delete; dual
  calendar (Hijri · Gregorian) per ADR-005; ar/en + RTL; logical Tailwind only;
  typecheck + lint green; verified in-browser across finance/gro/hr roles.
- **Evidence:** `evidence/employees/EMP-03.md`.
- **Dependencies:** EMP-02. **Risks:** create form kept core-only (salary/govdata
  via detail per-group edit) to mirror the API and keep the form sane; prod
  `next build` deferred (dev-server-clobber landmine) — typecheck+lint stand in.
- **Deferred:** client-rep read-own view → Client Portal (5.1); TanStack Query
  (standing).

## Priority 2 — Configuration module epic (ACTION-PLAN 2.4, architecture.md §Localization)

Same rules, same loop. Evidence goes to `evidence/configuration/CONF-XX.md`. The
three-level settings substrate — **system / per-client / per-user**, resolved
user → client → system (most specific wins). Every setting *declares* which
levels it permits; an override of a non-permitted level (or unknown key) is a
Configuration API error, never a silent fallback. The dual-calendar utility
already exists (`@hr/dates`); this epic is settings + feature flags. Depends on
Authz (done) + Audit (done).

| ID | Task | Depends on | Status |
|---|---|---|---|
| CONF-01 | Settings **catalog** + system-level resolution + system settings API (System Admin, audited) | 2.2, 2.3 | done ([evidence](evidence/configuration/CONF-01.md)) |
| CONF-02 | **Per-client** overrides (`cfg_client_settings`, RLS + harness) + client→system precedence + Company-Admin API | CONF-01 | done ([evidence](evidence/configuration/CONF-02.md)) |
| CONF-03 | **Per-user** preferences (`cfg_user_settings`, app-enforced) + full user→client→system resolution + `/config/me` | CONF-02 | done ([evidence](evidence/configuration/CONF-03.md)) |
| CONF-04 | **Feature flags** on the same substrate (`isEnabled`, system + per-client) + admin API | CONF-01 | done ([evidence](evidence/configuration/CONF-04.md)) |
| CONF-05 | **Web**: system-settings admin page + per-user preferences (wires the language switch into `ui.language`) | CONF-03 | done ([evidence](evidence/configuration/CONF-05.md)) |

### CONF-01 — Settings catalog + system-level resolution + system API
- **Objective:** stand up the Configuration module — a typed settings **catalog**
  (each setting declares permitted levels + zod validator + coded default), the
  system-level store, `ConfigService.get/getAll` resolving `system-override ??
  default`, and a System-Admin write API. The catalog is the contract CONF-02/03
  layer resolution onto, so the level declarations are set here, once.
- **Files:** `modules/configuration/{domain/catalog.ts, application/config.service.ts,
  api/config.controller.ts, configuration.module.ts, public-api.ts}`;
  `cfg_system_settings` model + migration (no RLS — deployment-wide system table;
  SELECT to both roles, INSERT/UPDATE to app_staff); `config.read`/`config.write`
  in the catalog (read = all staff, write = System Admin only); `@hr/contracts`
  config schemas; routes in the isolation harness (`staff`) + `config.system-set`
  in audited-writes; `test/configuration-api.e2e-spec.ts`.
- **API (owner decision):** per-key `PATCH /config/system/:key` (one validated
  value, one audit entry); CONF-02/03 mirror at `/config/client/:key`, `/config/me/:key`.
- **DoD:** catalog drives validation; system get/set works; **unknown key → 404
  and invalid value → 400** (never silent); write **System-Admin-only + audited**
  (non-sensitive — value recorded); `config.read` broad; coverage gates (isolation,
  catalog, audited-writes) + suite + lint + typecheck green. No per-client/per-user.
- **Evidence:** `evidence/configuration/CONF-01.md`.
- **Dependencies:** 2.2, 2.3. **Risks:** `config.write` holders are MFA-required
  (System Admin) → tests use `loginAsEnrolledStaff`; `cfg_system_settings` is a
  non-client-scoped system table (registered `staff` in the harness — no RLS);
  added `zod` as a direct API dependency (the catalog defines validators).

### CONF-02 — Per-client setting overrides
- **Objective:** add the CLIENT tier — `cfg_client_settings` (first client-scoped
  table in the module) + `client → system` resolution + a staff (Company Admin)
  API to set/clear a client's overrides for an explicit `:clientId`.
- **Files:** `cfg_client_settings` model + migration (client-scoped checklist:
  client_id, GRANTs, RLS both policies w/ NULLIF; composite PK, no sequence);
  `ConfigService.getAllForClient/setClient/clearClient`; controller `GET
  /config/client/:clientId`, `PATCH`/`DELETE /config/client/:clientId/:key`
  (validates client via ClientsService); `config.write-client` perm → Company
  Admin; 3 routes in harness (`staff`) + 2 audited writes (`config.client-set`,
  `config.client-clear`); `test/configuration-client.e2e-spec.ts`.
- **Decision:** per-client is staff-managed (never the client), so the path
  carries `:clientId` and the endpoints are `staff` class; the table still ships
  RLS for the future client-rep read path. `config.write-client` (Company Admin)
  is distinct from `config.write` (System Admin, system level).
- **DoD:** client override wins over system, doesn't leak up, per-client isolated;
  non-client-level setting → 400; invalid/unknown key/unknown client → 400/404/404;
  Company-Admin-only (non-holder 403); clear reverts to system; audited + scoped
  to the client; checklist satisfied; suite + lint + typecheck + build green.
- **Evidence:** `evidence/configuration/CONF-02.md`.
- **Dependencies:** CONF-01. **Risks:** first client-scoped table here — RLS
  shipped now, exercised by the future portal path (defence in depth); staff path
  means explicit `:clientId`, not request context.

### CONF-03 — Per-user preferences + full three-level resolution
- **Objective:** add the USER tier and close the model — `cfg_user_settings`
  (user-owned, app-enforced by context actorId, no RLS — the auth_users pattern)
  + full `user → client → system` resolution + `/config/me` for any principal.
- **Files:** `cfg_user_settings` model + migration (app_staff grants, NO RLS);
  `ConfigService.getEffectiveForActor/setUser/clearUser` (+ `effectiveBelowUser`
  for clear-reverts; actor from `requestContext`, never input); controller `GET
  /config/me`, `PATCH`/`DELETE /config/me/:key`; `config.read-self`/`config.write-self`
  perms → ALL roles (STAFF_BASE + ALL_CLIENT); NEW harness scope class `self`
  (any principal, own data, 401-on-unauth) + 3 routes; 2 audited writes
  (`config.user-set`/`config.user-clear`); `test/configuration-me.e2e-spec.ts`.
- **DoD:** user override wins; three-tier compose for a client-rep; staff = user→system;
  non-user-level → 400; invalid/unknown → 400/404; per-user isolation (app-enforced);
  actor from session not URL; clear reverts to lower tier; audited + actor-attributed;
  coverage gates + suite + lint + typecheck + build green.
- **Evidence:** `evidence/configuration/CONF-03.md`.
- **Dependencies:** CONF-02. **Risks:** user-owned data → app-enforced isolation
  (no RLS, like auth_users); added the `self` harness class rather than mislabel
  per-user endpoints `staff`; no catalog setting declares both client+user levels
  yet, so user>client precedence is implemented but not exercised on one key.

### CONF-04 — Feature flags
- **Objective:** feature flags on the SAME substrate — a flag is a boolean
  setting under the `flag.` namespace, so it resolves/validates/toggles through
  the existing settings machinery. `ConfigService.isEnabled(flag,{clientId})` is
  the read sugar other modules gate on.
- **Files:** `domain/catalog.ts` (FLAG_DEFS with `z.boolean()`, levels
  [system,client], default false; `isFlagKey`; merged into CATALOG);
  `ConfigService.isEnabled/flagsFor`; controller `GET /config/flags`;
  `@hr/contracts` `configFlagsResponseSchema`; +1 harness route; NO new tables,
  write endpoints, or permissions (toggles reuse `PATCH /config/{system,client}`);
  `test/configuration-flags.e2e-spec.ts`.
- **DoD:** flags default off + listed; toggle via existing system/client
  endpoints; `isEnabled` reflects it + rejects non-flag keys; boolean-only (400);
  per-client resolution; audited via existing actions; coverage + suite + lint +
  typecheck + build green.
- **Evidence:** `evidence/configuration/CONF-04.md`.
- **Dependencies:** CONF-01 (+CONF-02 for per-client). **Risks:** flags surface in
  `/config` + `/config/catalog` alongside settings (they ARE settings) — filtered
  boolean view is `/config/flags`; no user tier for flags.

### CONF-05 — Configuration settings web UI
- **Objective:** the first user-visible surface of the three-level model — a
  Settings page: everyone manages their own preferences (the language control
  persists to `ui.language`); System Admins edit system settings + toggle flags.
- **Files:** `(app)/settings/page.tsx` (My preferences + Applies-to-you +
  System-settings/Flags gated on `config.write`); `app-shell.tsx` (Settings nav,
  `config.read-self`); `language-switcher.tsx` (persist `ui.language` on switch);
  `login/page.tsx` (land in the stored language); `messages/{en,ar}.json`
  (`nav.settings` + `settings` namespace).
- **DoD:** preferences for all + system section gated; language persists + applies
  (switch + login landing); resolved settings shown; system enum/string edits +
  flag toggles over the CONF-01/04 API; ar/en + RTL; typecheck + lint green;
  verified in-browser as finance (no system section) and system_admin (full +
  live flag toggle).
- **Evidence:** `evidence/configuration/CONF-05.md`.
- **Dependencies:** CONF-01..04. **Risks:** Base UI `SelectValue` needs a render
  function for labels; array-typed settings (working.week/ui.languages) shown
  read-only (editors are a fast-follow).

## Priority 3 — Documents + Storage epic (ACTION-PLAN 3.2, architecture.md)

Same rules, same loop. Evidence goes to `evidence/documents/`. The last
critical-path module (Clients → Employees → **Documents**); unblocks the
document-expiry engine (3.4), GRO (4.2), and the Client Portal (5.1). Split per
the architecture into **Storage** (shared: S3-compatible object store, presigned
uploads, per-client key prefixes) + **Documents** (business: client-scoped
metadata with **expiry as first-class data**). Depends on Clients (done).

| ID | Task | Depends on | Status |
|---|---|---|---|
| STOR-01 | Storage shared module — S3-compatible adapter (provider-agnostic, presigned PUT/GET + delete, per-client prefixes) + MinIO in docker-compose | Clients | done ([evidence](evidence/documents/STOR-01.md)) |
| DOC-01 | Documents module + `doc_documents` client-scoped table (RLS checklist) — metadata + `expiryDate` first-class + `DocumentsService` (staff path) + seed | STOR-01 | done ([evidence](evidence/documents/DOC-01.md)) |
| DOC-02 | Upload flow — presigned-PUT issue (`POST /documents` → pending metadata + upload URL) + confirm; `document.upload`; audited; harness | DOC-01 | done ([evidence](evidence/documents/DOC-02.md)) |
| DOC-03 | Download (presigned GET) + delete (`document.delete` + object removal) + list/filter incl. by expiry; audited | DOC-02 | todo |
| DOC-04 | Virus-scan hook (pluggable interface, dev pass-through; ClamAV deferred to infra) + retention/PDPL hooks (0.9) | DOC-02 | todo |
| DOC-05 | Web UI — documents list + upload + download (per client/employee) | DOC-03 | todo |

### STOR-01 — Storage shared module (S3-compatible adapter)
- **Objective:** provider-agnostic `StorageService` — S3-compatible via AWS SDK
  v3, endpoint-configurable (MinIO local / KSA store prod), per-client key
  prefixes, presigned PUT/GET + delete. Foundation for the Documents cards.
- **Files:** `docker-compose.yml` (minio service, ports 9002/9003);
  `apps/api` deps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`;
  `modules/storage/{storage.module.ts (@Global), public-api.ts, application/storage.service.ts}`
  (`keyFor`/`presignUpload`/`presignDownload`/`deleteObject`/`putObject`/`getObject`,
  lazy `ensureBucket`); `STORAGE_*` in `.env.example`/`apps/api/.env` +
  `turbo.json globalEnv`; `test/storage.e2e-spec.ts` (real MinIO round-trip).
- **DoD:** presigned upload+download round-trip against MinIO; per-client prefix;
  delete → 404; SigV4 signed URLs; endpoint-agnostic; env in globalEnv; lint +
  typecheck + test + build green. No HTTP endpoints (pure adapter → no harness).
- **Evidence:** `evidence/documents/STOR-01.md`.
- **Dependencies:** Clients (2.5). **Risks:** new MinIO infra; Turbo globalEnv
  landmine; `forcePathStyle` for MinIO; prod provider still ADR-006-open (adapter
  written provider-agnostic so it's config, not code).

### DOC-01 — Documents module + registry table
- **Objective:** the metadata layer — `doc_documents` (client-scoped, RLS
  checklist) with `expiryDate` first-class + `DocumentsService` (staff path) +
  seed. Registry over the STOR-01 blobs; foundation for DOC-02/03 and 3.4.
- **Files:** `Document` model + 2 enums (DocumentCategory/Status) + migration
  (grants staff-full/rep-SELECT, RLS both policies, expiry+employee indexes);
  `modules/documents/{documents.module.ts, public-api.ts, domain/document.ts,
  application/documents.service.ts}` (`create` audited + service-derived
  per-client `storageKey`, `list`/`listByClient`/`getById`,
  `expiringOnOrBefore`); AppModule registration; `seedDocuments` (3 fixtures w/
  expiry, linked to seed employees); `test/documents.e2e-spec.ts`.
- **DoD:** checklist satisfied; staff create round-trips metadata+expiry;
  per-client sanitized storage key; `expiringOnOrBefore` excludes null/later/
  deleted; audited non-sensitive; rep reads own only + cannot write; seed
  idempotent; suite + lint + typecheck + build green.
- **Evidence:** `evidence/documents/DOC-01.md`.
- **Dependencies:** STOR-01. **Risks:** audit rows carry a BigInt id (serialize
  before/after only in assertions); no HTTP yet (like EMP-01 → no harness);
  client-rep create-own deferred (SELECT-only for now).

### DOC-02 — Documents upload flow (presigned issue + confirm)
- **Objective:** the presigned, direct-to-store upload flow — issue (pending
  metadata + PUT URL) → client transfers bytes → confirm (blob verified →
  available). The module's first HTTP surface.
- **Files:** `@hr/contracts` document schemas; `StorageService.statObject`
  (HeadObject); `domain/document-policy.ts` (`canWriteCategory`);
  `DocumentsService.confirm`; `api/documents.controller.ts` (`POST /documents`,
  `POST /documents/:id/confirm`); module wires the controller + ClientsModule;
  `document.upload` perm → company_admin/hr_officer/recruiter/gro_officer;
  2 routes in isolation (`staff`) + audited-writes (`document.create`/`confirm`);
  `test/documents-api.e2e-spec.ts`.
- **DoD:** issue→PUT→confirm round-trip (confirm sets real size); confirm before
  upload → 400; category scope (recruiter recruitment, GRO gov, admin/HR all);
  finance no upload → 403; unknown client 400 / bad payload 400 / unauth 401;
  audited; coverage + suite + lint + typecheck + build green.
- **Evidence:** `evidence/documents/DOC-02.md`.
- **Dependencies:** DOC-01 (+ STOR-01). **Risks:** confirm is an update → needs
  `@HttpCode(200)` (POST defaults 201); requires MinIO up for the e2e.

## Post-skeleton epics (not yet broken down — task cards authored when their phase starts)

| Epic | Source | Gate |
|---|---|---|
| Authentication (sessions, MFA, login surfaces) | ACTION-PLAN 2.1 | WS-22 signed off |
| Authorization module (permission catalog, policy service, role mapping) | ACTION-PLAN 2.2 | WS-22 |
| Audit Logs | ACTION-PLAN 2.3 | WS-22 |
| Configuration module (three-level settings) | ACTION-PLAN 2.4 | WS-22 |
| Clients module | ACTION-PLAN 2.5 | Auth + Audit done |
| Employees module | ACTION-PLAN 3.1 | Clients + reference-system field mapping (ACTION-PLAN 0.8) |
| Documents + Storage / Notifications / expiry engine | ACTION-PLAN 3.2–3.4 | Clients |
| Recruitment / GRO / Requests + Tasks | ACTION-PLAN 4.x | Domain core |
| Client Portal / Calendar + Google / Reporting | ACTION-PLAN 5.x | Workflows |
