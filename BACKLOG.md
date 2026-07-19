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
| WS-20 | Finalize ADR-006 + deploy pipeline to KSA host | WS-09 | in progress — ADR-006 **Accepted rev. 2 (OCI Saudi)** after AWS failed access verification; blocked on owner provisioning ([guide](docs/PROVISIONING-OCI.md)) |
| WS-21 | Backups + restore test | WS-20 | todo |
| WS-22 | Skeleton exit review (evidence walkthrough) | WS-01…WS-21 | todo |

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
