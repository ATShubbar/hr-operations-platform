# Action Plan — HR Operations Platform

**Companion to:** `architecture.md` v1.1
**Status legend:** 🔴 blocking (nothing downstream starts until done) · 🟡 needed before the phase that consumes it · 🟢 before production go-live

---

## Priority 0 — Decisions & spikes (Week 1–2)

These produce ADRs and throwaway spike code only. No production code before they're done.
Draft records already exist in `adr/` (see `adr/README.md` for the index): the P0 work is to **finalize** them — run SPIKE-001 to harden ADR-001, complete the ADR-006 provider evaluation, and confirm the Proposed records (003, 004, 007) as they get implemented in the walking skeleton.

| # | Action | Depends on | Output |
|---|---|---|---|
| 0.1 | 🔴 **ADR-001: Data isolation.** Client-company isolation via mandatory `client_id` + Postgres RLS backstop for client-representative sessions. Executed as **SPIKE-001** (see `SPIKE-001-rls-prisma-pooling.md` for goals, success criteria, and recommended approach) | — | ADR + working spike repo |
| 0.2 | 🔴 **ADR-002: Authorization.** Permission-based RBAC, central policy service, deny-by-default global guard, permission catalog naming convention, field-level sensitivity (salary vs. iqama-expiry visibility) | 0.1 (actor scoping model) | ADR + permission catalog seed |
| 0.3 | 🔴 **ADR-003: Module skeleton & boundary enforcement.** Directory layout per module, single `public-api.ts`, table-name prefixes, ESLint import-boundary rules, per-module Prisma access conventions | — | ADR + lint config |
| 0.4 | 🔴 **ADR-004: Inter-module events.** In-process domain event bus; which side effects must be transactional (outbox + BullMQ consumer) vs. best-effort | 0.3 | ADR |
| 0.5 | 🔴 **ADR-005: Localization.** i18n library choice, string externalization workflow, RTL lint rule (block physical left/right utilities), Hijri↔Gregorian utility ownership, bilingual field convention (`name_ar`/`name_en`) | — | ADR + shared date/i18n utility spec |
| 0.6 | 🔴 **ADR-006: KSA cloud provider.** Evaluate Google Cloud (Dammam), Oracle (Riyadh/Jeddah), STC Cloud, current AWS/Azure KSA status. Deciding factor: **managed** Postgres/Redis/object storage availability | — | ADR + provider account |
| 0.7 | 🟡 **ADR-007: API conventions.** REST + OpenAPI from NestJS, error envelope, cursor pagination, idempotency keys, per-client rate limiting | 0.3 | ADR |
| 0.8 | 🟡 **Reference-system field mapping.** For Qiwa, GOSI, Muqeem, Mudad, ZATCA: list the exact fields/enums the Employee, GRO, and (future) Billing schemas must carry. Manual-entry v1, connector-ready shape | — | ✅ **DONE** → `docs/FIELD-MAPPING.md` (feeds Phase 3/6 schemas) |
| 0.9 | 🟢 **PDPL compliance checklist.** Consent basis, data-subject rights, retention/erasure with legal holds, breach procedure. Legal review of Google Calendar under the no-PII payload constraint | — | Compliance checklist; go/no-go on Calendar guardrails |

## Priority 1 — Walking skeleton (Week 2–3)

One deployable slice through every layer, before any business module.

| # | Action | Depends on |
|---|---|---|
| 1.1 | Monorepo setup (pnpm workspaces + Turborepo): `apps/web`, `apps/api`, `packages/contracts` (shared Zod schemas), `packages/config` | 0.3 |
| 1.2 | CI/CD: lint (including boundary + RTL rules), typecheck, test, migrate, deploy to KSA host | 0.6, 1.1 |
| 1.3 | Skeleton NestJS app with: global deny-by-default guard, request-context (actor + client scope), structured JSON logging with request ID, health checks | 0.2, 1.1 |
| 1.4 | Skeleton Next.js app with: i18n scaffold (ar/en), RTL layout switching, shadcn/ui RTL verification of core components | 0.5, 1.1 |
| 1.5 | Database plumbing: Prisma migration workflow, RLS policies from spike productionized, seed scripts | 0.1, 1.2 |
| 1.6 | **Cross-client isolation test harness in CI**: framework that probes endpoints with wrong-client principals; leak = build failure | 1.3, 1.5 |
| 1.7 | Backup schedule + first restore test on the managed Postgres | 0.6 |

### Walking skeleton — Definition of Done

Each step has a binary, demonstrable exit condition. The skeleton is not "mostly done" — every box below is checked before Priority 2 begins.

**Evidence rule:** a box may be checked **only with linked, reviewable evidence** — a CI run URL, committed test output, a log excerpt, or a screenshot. Evidence is collected in `evidence/skeleton/` (one file per step, e.g. `1.2-cicd.md`, containing the links/excerpts and the date). "It works on my machine" closes nothing; the exit review at the end of this section is a walkthrough of the evidence folder, not a verbal status.

**1.1 Monorepo** — DONE when:
- [ ] `pnpm install && pnpm build && pnpm test` succeeds from a clean clone
- [ ] `apps/web`, `apps/api`, `packages/contracts`, `packages/config` exist and `web`/`api` both consume a shared Zod schema from `contracts`
- [ ] Module skeleton exists in `apps/api` with one example module following the ADR-003 layout and a single `public-api.ts`

> **Evidence:** CI run URL for a clean-clone build+test; short repo-tree listing; link to the example module's `public-api.ts`.

**1.2 CI/CD** — DONE when:
- [ ] Every PR runs lint (including import-boundary and RTL rules), typecheck, and tests; a violation of a module boundary or a physical `left/right` Tailwind utility **fails the build** (proven with a deliberately bad PR)
- [ ] Merge to main deploys automatically to the KSA-hosted environment, including Prisma migrations
- [ ] A rollback to the previous deploy has been performed once, on purpose

> **Evidence:** link to the deliberately-bad PR with its red CI run and the lint error output; a green deploy run URL; the rollback run URL plus a log excerpt showing version N → N−1.

**1.3 API skeleton** — DONE when:
- [ ] A request to any endpoint without an explicit permission declaration is rejected (deny-by-default proven with a test endpoint that "forgot" its guard metadata)
- [ ] Every log line carries request ID, actor ID, and client scope; a single request can be traced end-to-end through logs
- [ ] Health/readiness endpoints exist and the deploy gate uses them

> **Evidence:** test output for the unguarded-endpoint rejection; a pasted log excerpt showing one request ID traced across all lines of a request; deploy-gate config referencing the health endpoint.

**1.4 Web skeleton** — DONE when:
- [ ] One page renders fully in Arabic (RTL) and English (LTR), switchable at runtime, with zero hardcoded strings
- [ ] The shadcn/ui components shortlisted for early phases render correctly in RTL (verified visually, list recorded)
- [ ] A Hijri date renders from a Gregorian-stored value via the shared Configuration utility

> **Evidence:** side-by-side screenshots of the same page in Arabic (RTL) and English (LTR); the recorded RTL component checklist with pass/fail per component; unit-test output for the Gregorian→Hijri render.

**1.5 Database plumbing** — DONE when:
- [ ] SPIKE-001's chosen pattern is implemented as production code (client extension / role setup / RLS policies in migrations)
- [ ] `prisma migrate` manages RLS policies and DB roles (raw SQL migrations), applied by CI, not by hand
- [ ] Seed script creates: 2 client companies, staff users of each role, 1 client-rep user per client

> **Evidence:** CI run URL applying migrations (including RLS policies and roles) to a fresh database; seed-run log; link to SPIKE-001 results referenced by ADR-001.

**1.6 Isolation test harness** — DONE when:
- [ ] CI runs a suite that hits every registered endpoint as a client-rep of Client A requesting Client B's data and asserts zero rows / 403 — currently green against the skeleton's example module
- [ ] Adding a new endpoint without registering it in the harness fails CI (coverage is enforced, not voluntary)

> **Evidence:** green CI run URL for the isolation suite with the test-count summary; a red CI run URL from a demonstration commit adding an unregistered endpoint.

**1.7 Backups** — DONE when:
- [ ] Automated backup schedule is live on the KSA-managed Postgres
- [ ] One full restore into a scratch environment has been executed and the restored app boots against it
- [ ] RPO/RTO targets are written into ADR-006

> **Evidence:** backup-schedule config or provider screenshot; restore-run log with timestamps (this measures actual RTO); screenshot or health-check output of the app booted against the restored database; link to the RPO/RTO section in ADR-006.

**Overall exit criteria — move to Priority 2 only when:** a request can travel browser → localized RTL page → authenticated API → RLS-scoped Postgres query → audit-ready structured log, on infrastructure in KSA, deployed by CI, with the isolation harness green — **and `evidence/skeleton/` contains the evidence file for every step above.** The exit review walks that folder end-to-end; any box without evidence is open, regardless of who says otherwise.

## Priority 2 — Foundation modules (Phase 1–2 of roadmap)

| # | Action | Depends on |
|---|---|---|
| 2.1 | **Authentication**: Redis-backed httpOnly sessions, login, password policy, MFA (required for admin roles), user store with principal type + client binding | 1.3, 1.5 |
| 2.2 | **Authorization**: permission catalog, role→permission mapping, policy service `can(actor, action, resource)`, route permission metadata | 2.1 |
| 2.3 | **Audit Logs**: append-only tables (no UPDATE/DELETE grants), automatic mutation logging with actor + client scope + before/after, admin read UI | 2.1, 0.4 |
| 2.4 | **Configuration**: settings, feature flags, shared localization/date utilities live here | 1.1 |
| 2.5 | **Clients module**: client company registry, `client_id` origination, client lifecycle states, client-user management (Client Admin invites Client User) | 2.2, 2.3 |

## Priority 3 — Domain core (Phase 3–4)

| # | Action | Depends on |
|---|---|---|
| 3.1 | **Employees module**: schema built from the 0.8 field mapping — bilingual names, iqama/border/GOSI/Nitaqat fields, contract types, Hijri-rendered dates, salary behind its own permission | 2.5, 0.8 |
| 3.2 | **Storage + Documents**: presigned uploads, virus scanning, per-client key prefixes, document metadata with **expiry as first-class data**, retention policy hooks | 2.5, 0.9 |
| 3.3 | **Notifications**: in-app + email, Arabic/English templates, per-user preferences, BullMQ dispatch | 0.4, 2.1 |
| 3.4 | **Document expiry engine**: daily BullMQ scan → expiry alerts (iqama, passport, contract). First real cross-module event consumer | 3.2, 3.3 |

## Priority 4 — Workflows (Phase 5–7)

| # | Action | Depends on |
|---|---|---|
| 4.1 | **Recruitment**: pipeline, candidates, CV documents, offer flow; `CandidateHired` event → Employees record creation | 3.1, 3.2, 3.3 |
| 4.2 | **GRO**: government-process workflows (iqama renewal, visas, transfers) over Employees + Documents; heaviest Hijri/reference-field consumer | 3.1, 3.4 |
| 4.3 | **Requests**: client-facing workflow objects with status tracking and SLAs | 2.5, 3.3 |
| 4.4 | **Tasks**: internal work items; Requests spawn Tasks via events; assignment + due dates (Sun–Thu aware) | 4.3, 0.4 |

## Priority 5 — Delivery surfaces (Phase 8–10)

| # | Action | Depends on |
|---|---|---|
| 5.1 | **Client Portal**: client-scoped views over Employees, Documents, Requests; client-rep login surface; production proof of RLS + isolation tests | 4.3, 3.1, 3.2, 1.6 |
| 5.2 | **Calendar**: internal scheduling over GRO deadlines, Tasks, Requests | 4.2, 4.4 |
| 5.3 | **Google Calendar integration**: adapter-enforced no-PII payloads (neutral titles + internal reference codes only); passes 0.9 review | 5.2, 0.9 |
| 5.4 | **Reporting**: transactional queries + materialized views; permission-filtered; export | 4.1–4.4 |

## Explicitly deferred (do not build, do not partially build)
- Employee self-service (identity model keeps the door open; nothing else)
- Government platform connectors (schemas are connector-ready; that is the entire v1 commitment)
- Billing / ZATCA e-invoicing
- SMS/WhatsApp notification channels
- AI & Automation
- Multi-consultancy SaaS tenancy

## Dependency spine (critical path)

```
ADRs 001–006 ──► Walking skeleton ──► Auth/Authz + Audit ──► Clients ──► Employees ──► Documents/Notifications
                                                                              │
                                              ┌───────────────┬──────────────┤
                                              ▼               ▼              ▼
                                         Recruitment         GRO      Requests/Tasks
                                              └───────┬──────┴──────────────┘
                                                      ▼
                                    Client Portal · Calendar+Google · Reporting
```

The critical path runs through **Clients → Employees → Documents**. Recruitment, GRO, and Requests/Tasks can proceed in parallel once those land, if team size allows.
