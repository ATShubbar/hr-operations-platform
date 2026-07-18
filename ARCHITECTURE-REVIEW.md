# Architecture Review — HR Operations SaaS (v1.0)

**Reviewer role:** Principal Software Architect
**Date:** 2026-07-18
**Subject:** `architecture.md` v1.0
**Verdict:** The foundations you chose are sound, but the document is a *vision statement*, not an architecture. The highest-risk decisions — tenancy model, authorization, module boundaries enforcement, government integrations, localization — are either missing or specified in one sentence. Several of those are one-way doors: getting them wrong means a rewrite, not a refactor.

---

## 1. What you got right (keep these)

- **Modular monolith, one database, one deployment.** Correct call for a small team building a broad product. Microservices here would be malpractice.
- **Boring, coherent stack.** Next.js + NestJS + PostgreSQL + Prisma + Redis is well-trodden, hireable, and AI-tooling-friendly. TypeScript end-to-end enables shared contracts.
- **"Expose services, not tables" / no cross-module DB access.** The right discipline — but see §4.3: nothing in your stack enforces it, so it needs a mechanism, not a slogan.
- **Data residency stated as non-negotiable up front.** Good — but incomplete (see §3.2 and §4.9: PDPL is the real requirement; residency is just one clause of it).
- **Architecture-before-code, AI-first.** Fine — but the AI Master Prompt references structure ("never generate code outside the current module") that the document never defines. The prompt depends on a module skeleton spec that doesn't exist yet.

---

## 2. Critical gaps — decisions that block implementation (P0)

These are not "nice to add later." Each one shapes the schema, the auth layer, and every module built on top. They must be decided **before Authentication (roadmap step 1) is written.**

### 2.1 The tenancy model is one sentence, and it's the most important decision in the product

> "Every company only accesses its own records."

This hides enormous complexity, because your product is **not two-tier, it's three-tier**:

```
Platform (you)
 └── Company (your paying customer — an HR services / manpower firm)   ← the tenant
      └── Client (the company's customer, with Client Admin / Client User logins)
           └── Employees (people placed at / managed for that client)
```

The existence of a Clients module, a Client Portal, and Client Admin/Client User roles proves this. That means you have **two scoping boundaries, not one**:

1. **Tenant isolation** (Company A never sees Company B) — a security boundary.
2. **Client scoping** (Client User at Client X sees only Client X's employees, requests, documents *within* the tenant) — an authorization boundary that behaves almost like nested tenancy.

**Undecided questions that must be answered now:**

- **Isolation strategy:** shared schema with `tenant_id` column (recommended for your scale), schema-per-tenant, or DB-per-tenant? Decide and write the ADR.
- **Enforcement mechanism:** application-level filtering via Prisma is the default, but it fails *open* — one forgotten `where: { tenantId }` is a cross-tenant data leak in an HR product holding passports and salaries. Recommendation: **shared schema + PostgreSQL Row-Level Security as a backstop**, with `tenant_id` set per-request. Note: RLS + Prisma + connection pooling requires deliberate design (per-request `SET LOCAL app.tenant_id` inside a transaction, or the pooler breaks your session variables). This interaction is exactly the kind of thing that must be prototyped in week 1, not discovered in month 4.
- **Does every table carry `tenant_id`, even child tables?** (Answer: yes — denormalize it everywhere; joins for tenancy checks are how leaks happen.)
- **Client scoping representation:** is `client_id` a second mandatory scoping column on client-visible resources? Which resources are client-visible at all?
- **Cross-tenant actors:** System Admin support access — impersonation model, audit trail for it, and whether support access is time-boxed and consented. Decide now; bolting on later is painful.

### 2.2 Nine roles, zero authorization model

A role list is not an authorization model. Missing decisions:

- **RBAC shape:** static roles → permissions mapping (recommended for v1), or per-tenant custom roles? Decide now — the schema differs.
- **Permission granularity:** action-level (`employee.read`, `employee.update.salary`)? Field-level visibility matters here: a Client User probably may see an employee's iqama expiry but not their salary; Finance sees salaries but maybe not medical documents.
- **Where policy is enforced:** one policy layer (e.g., NestJS guards + a central `can(actor, action, resource)` service), deny-by-default. Never scatter `if (role === 'RECRUITER')` through handlers — that's unauditable and un-refactorable.
- **Missing actor: the Employee.** You manage employees but give them no login. Is employee self-service (view own documents, iqama expiry, payslips, raise requests) in scope ever? If "yes, later," your identity model must anticipate a user type whose scope is *one person's records* — decide now, even if the feature ships in v2.
- **One identity system or two?** Internal staff vs. client portal users vs. (future) employees. Recommendation: one user table, multiple principal types, one auth stack — separate login surfaces if UX demands it.

### 2.3 Government integrations are the product, and they're absent

For a Saudi HR/GRO product, the integrations list — **"Google Calendar"** — is startling. GRO work *is* interaction with government platforms:

| Platform | Function | Relevance |
|---|---|---|
| **Qiwa** | Labor contracts, work permits, Saudization (Nitaqat) | Core GRO |
| **GOSI** | Social insurance registration, wage declarations | Core HR ops |
| **Mudad / WPS** | Wage Protection System payroll compliance | Core if payroll touches you |
| **Muqeem** | Iqama issuance/renewal, exit-reentry visas | Core GRO |
| **Absher Business** | Government services for orgs | Core GRO |
| **Elm / Yakeen** | Identity verification | Onboarding |
| **ZATCA** | E-invoicing (Fatoora) — legally mandatory | Billing module |

Even if v1 does **zero API integration** and GRO officers work manually, the *data model* must mirror these systems' concepts (iqama numbers, border numbers, Nitaqat status, GOSI wage, contract types under Saudi labor law, probation rules, end-of-service benefit accrual). Decide per platform: manual-entry v1 → API later, and design entities accordingly. If you skip this, your Employee and GRO schemas will be wrong in ways that hurt.

### 2.4 Localization is not mentioned once

For Saudi Arabia this is a P0, not a polish item:

- **Arabic + English UI, RTL layout.** Retrofitting RTL into a Tailwind/shadcn codebase later is weeks of work; using logical properties (`ps-*`/`pe-*`, `start`/`end`) from day one is nearly free. Decide now.
- **Hijri calendar.** Government documents, iqama expiry, and GOSI use Hijri (Umm al-Qura) dates. You need a policy: **store Gregorian (UTC), render/accept Hijri where contextually required, never store Hijri as the source of truth.** Dual-calendar date handling must be a shared utility, not per-module improvisation.
- **Bilingual data.** Employee names, job titles, and company names exist in Arabic and English on official documents. Are name fields single or dual? (Official Saudi documents say: dual.)
- **Week structure:** Sunday–Thursday work week affects Calendar, SLAs, and reporting.

---

## 3. Inconsistencies and contradictions

### 3.1 The roadmap contradicts the domain's dependency graph

Roadmap: Authentication → Clients → **Recruitment → Client Portal → GRO → Employees** → Reporting → AI.

- **Employees at position 6 is wrong.** GRO (position 5) operates *on employees* — iqama renewals, visas, government status. Recruitment's terminal event is "candidate hired → **employee created**." Both upstream modules dangle without the Employee entity. Employees is the gravitational center of the domain and should be built immediately after Clients.
- **Four declared modules never appear in the roadmap:** Documents, Tasks, Requests, Calendar. Documents especially cannot be deferred — Recruitment needs CVs and offer letters, GRO needs iqama/passport scans with **expiry tracking** (expiry alerts are arguably the single highest-value GRO feature). Documents is a shared capability needed by roadmap step 3.
- **No shared module appears in the roadmap.** Audit Logs must exist from the first mutation ever written — retrofitting audit coverage is somewhere between painful and impossible, and in this compliance environment it's table stakes. Notifications is needed by nearly every module.
- **"Client Portal" is a roadmap item but not a module.** Is it a separate Next.js app? A route group? Same API surface with client-scoped authorization? This is an architectural decision (see §2.1/§2.2) masquerading as a feature milestone.

**Suggested resequencing:**

> 0. Walking skeleton: monorepo, module skeleton, tenancy + RLS spike, CI/CD, deploy to KSA host
> 1. Authentication + authorization core + Audit Logs
> 2. Clients
> 3. Employees (with bilingual/Hijri fields, KSA-specific attributes)
> 4. Documents (upload, storage, **expiry tracking**) + Notifications
> 5. Recruitment (terminates in employee creation)
> 6. GRO (consumes Employees + Documents + Notifications)
> 7. Client Portal (thin: client-scoped views over existing modules)
> 8. Requests / Tasks / Calendar
> 9. Reporting
> 10. Billing (ZATCA-compliant), AI & Automation

### 3.2 Google Calendar vs. KSA data residency

Your only named integration conflicts with your only bolded principle. Syncing GRO/HR events to Google Calendar sends customer data (employee names, "Iqama renewal — Ahmed X") to Google infrastructure outside KSA. Either: (a) drop it from v1, (b) scope it to internal-staff scheduling with no employee PII in event payloads, or (c) get a legal read under PDPL data-transfer rules. Also note your *own* rule — "review every third-party integration for data residency" — was apparently not applied to the one integration listed.

### 3.3 Requests vs. Tasks: two modules, no boundary

Both exist as top-level modules with no definition. Predicted collision: a client "request" (e.g., "renew iqama for employee X") generates internal "tasks." Is a Request a client-facing workflow object and a Task an internal work item? Write the one-paragraph definition of each now, or merge them. Undefined adjacent modules are how duplicated business logic (your own forbidden item) happens.

### 3.4 "Billing (future)" — but tenancy and entitlements are not future

You can defer invoicing. You cannot defer: what a subscription/plan is, per-plan limits (seats, clients, storage), and feature gating. These touch the tenant model (§2.1) and middleware from day one. Reserve the concepts in the schema now; build invoicing later. When you do bill Saudi customers, **ZATCA e-invoicing (Fatoora) is legally mandatory** — a compliance project, not a Stripe toggle.

---

## 4. Missing architecture decisions (catalog)

Each of these deserves an ADR. Priority: 🔴 before first line of code, 🟡 before the module that needs it, 🟢 before production.

### 🔴 4.1 Repository & code structure
Monorepo (recommended: single repo, pnpm workspaces + Turborepo) vs. two repos. How types/validation contracts are shared between Next.js and NestJS — shared Zod schemas in a package, or OpenAPI codegen. The AI Master Prompt cannot say "never generate code outside the current module" until a concrete directory layout defines what a module *is* (e.g., `apps/api/src/modules/<name>/{domain,application,infra,api}` with a single `public-api.ts` export).

### 🔴 4.2 Inter-module communication
"Public interfaces" — but sync-only method calls, or also events? You need **in-process domain events** at minimum: `CandidateHired` → Employees creates record, Notifications fires, Audit logs — without Recruitment importing three modules. Decide: event bus mechanism, sync vs. async semantics, and whether side effects must be transactional with the trigger (if yes → transactional outbox pattern with Redis/BullMQ consumers). This decision defines what "module boundary" actually means in your codebase.

### 🔴 4.3 Enforcement of module boundaries
Prisma is a single global schema and a single generated client — **nothing stops Module A from querying Module B's tables.** Your rule is currently unenforceable. Options: ESLint import-boundary rules (`eslint-plugin-boundaries` / Nx enforce-module-boundaries) + per-module Prisma client wrappers exposing only that module's models + CI check. Also decide schema conventions: table prefixes per module (`rec_`, `gro_`, `emp_`) or Prisma multi-file schema per module. Without tooling, the modular monolith degrades into a tangled monolith by month three.

### 🔴 4.4 Authentication mechanics
Sessions vs. JWT (recommendation: httpOnly cookie sessions via Redis — you have Redis, revocation is trivial, and JWT revocation pain is not worth it for a first-party app). MFA (should be available day one for admin roles — this is HR data). Password policy, SSO (future? affects user model), session lifetime, device management for the client portal.

### 🔴 4.5 API design
REST vs. tRPC vs. GraphQL (recommendation: REST with OpenAPI from NestJS decorators — boring, cacheable, client-portal-friendly, future-mobile-friendly). Versioning policy, pagination convention (cursor-based), error envelope, idempotency keys for mutation retries, rate limiting (per-tenant, in Redis).

### 🟡 4.6 Background jobs & scheduling
Redis is listed but its role is unstated. You need a job system (BullMQ) for: document-expiry scans (daily), notification dispatch, report generation, future government-API polling. Decide: queue library, retry/dead-letter policy, idempotent job design, and where scheduled jobs live (which module owns "iqama expires in 30 days"?).

### 🟡 4.7 Documents & storage pipeline
S3-compatible storage is named; the pipeline is not: presigned upload URLs vs. proxy-through-API, virus scanning (you will host files uploaded by client users — this is non-optional), max sizes, allowed types, retention/deletion policy (PDPL right-to-erasure), **document metadata model with expiry dates as first-class data**, and access control on the storage layer (bucket-per-tenant vs. key-prefix + signed URLs).

### 🟡 4.8 Notifications
Channels: in-app, email, SMS, WhatsApp. In Saudi, SMS/WhatsApp are primary channels — evaluate local providers (Unifonic, Msegat) which also simplifies residency review. Template management, Arabic templates, per-user preferences, digest vs. immediate.

### 🔴 4.9 PDPL compliance (bigger than residency)
The Saudi **Personal Data Protection Law** is your real regulatory envelope; residency is one clause. Also required: lawful-basis/consent tracking, data-subject rights (access, correction, erasure — hard when the same record backs GOSI obligations; you'll need legal-hold semantics), breach notification procedure, processing records, and appointment obligations. Additionally: encryption at rest and in transit, field-level protection for high-sensitivity data (passport numbers, salaries), and audit-log immutability (append-only, no UPDATE/DELETE grants). Employee data is among the most sensitive data categories that exist; treat security architecture as a P0 workstream, not a hardening phase.

### 🟡 4.10 Search
A "Search" shared module is declared with no technology. Recommendation: **PostgreSQL full-text search for v1** (with `pg_trgm` for Arabic-friendly fuzzy matching); do not introduce Elasticsearch/OpenSearch until Postgres provably fails — it's another KSA-residency-constrained stateful system to operate. Note Arabic text search has real complexity (diacritics, letter-form normalization: ا/أ/إ/آ, ه/ة, ي/ى) — plan normalization at index time.

### 🟡 4.11 Reporting architecture
Module #10 with no approach. Decide v1: transactional queries + materialized views on the primary (fine at your scale), read replica when load demands, warehouse later. Say it, so nobody builds an ETL pipeline in month two.

### 🟢 4.12 Observability
Nothing specified. Minimum: structured JSON logging with `tenant_id` + request-ID correlation on every line, error tracking (self-hosted Sentry if residency review fails SaaS Sentry), uptime monitoring, and basic metrics. Residency applies to logs too — logs will contain personal data no matter how careful you are.

### 🟢 4.13 Environments, deployment, DR
Which Saudi cloud provider? This is urgent, not procedural — it determines whether you get **managed** PostgreSQL/Redis/object storage or you operate your own database in Docker (a major, understated operational risk for a small team). Evaluate: Google Cloud (Dammam), Oracle Cloud (Riyadh/Jeddah), STC Cloud, and current AWS/Azure KSA region status. Then: environments (dev/staging/prod), migration strategy (Prisma Migrate with review gates; who runs migrations, how are destructive migrations handled), backup schedule + **restore testing**, RPO/RTO targets. "Backups remain inside KSA" is a constraint, not a strategy.

### 🟢 4.14 Testing strategy
None stated. Especially critical given AI-first development — AI-generated code needs a strong verification harness. Minimum bar: unit tests on domain logic, integration tests per module public interface, and **automated cross-tenant isolation tests** (every endpoint probed with a wrong-tenant principal — make leaks a CI failure, not an incident).

---

## 5. Challenged decisions

1. **"One PostgreSQL database" — agree, but state the exception policy.** Redis already makes it two data systems. Say what Redis is allowed to hold (cache, sessions, queues — never source-of-truth) so it doesn't drift into a second database.
2. **Prisma — acceptable, with eyes open.** Known friction points for *this* design: RLS/session-variable awkwardness with pooling (§2.1), a single global client undermining module ownership (§4.3), and limited support for advanced Postgres features you may want (partial indexes are fine; some RLS/trigger work will live in raw SQL migrations). Alternatives (Drizzle, Kysely) trade maturity for control. Staying with Prisma is defensible — but write the ADR acknowledging the mitigations, so the RLS spike happens deliberately.
3. **shadcn/ui — fine, verify RTL early.** Radix primitives support RTL, but verify the specific components you'll use in a week-1 spike, not after 40 screens exist.
4. **"AI & Automation" as roadmap item 8 is not a plan.** Name candidate features (CV parsing/matching, document data extraction, request triage) or delete the line. Unscoped AI line items are where roadmaps go to lie. Also note: most LLM APIs process data outside KSA — your residency principle applies to AI features too, and may constrain you to region-pinned or self-hosted models.
5. **"No duplicated business logic" is overclaimed as stated.** Across module boundaries some duplication is *correct* (better than coupling modules to share a helper). The rule you want: *no duplicated ownership* — every business rule has exactly one owning module; others call it or react to its events.
6. **Version the document properly.** v1.0 with no changelog, no decision log, no owner. Split into: `architecture.md` (stable principles), `adr/` (one decision per file — tenancy, auth, events, provider...), and `roadmap.md` (volatile). The AI Master Prompt should then reference ADRs — that's what makes "architecture before code" real for AI-driven development, since the ADRs become the context you feed the model.

---

## 6. Top 10 actions, in order

| # | Action | Why now |
|---|---|---|
| 1 | ADR: tenancy model (3-tier, shared schema + `tenant_id` + RLS backstop) + **week-1 RLS/Prisma/pooling spike** | Every table depends on it; failure mode is a data breach |
| 2 | ADR: authorization (permission-based RBAC, central policy service, deny-by-default; decide employee-actor question) | Auth is roadmap item 1 |
| 3 | Define module skeleton + boundary enforcement tooling (lint rules, `public-api.ts`, table prefixes) | The AI Master Prompt is unusable without it |
| 4 | ADR: inter-module events (in-process bus; outbox if transactional) | Defines what "module" means in practice |
| 5 | Resequence roadmap (Employees to #3, Documents+Audit+Notifications explicit, walking skeleton as #0) | Current order builds consumers before their dependency |
| 6 | Select KSA cloud provider; verify managed Postgres/Redis/storage | Determines your ops burden and DR story |
| 7 | Localization ADR: Arabic/RTL from day one, Gregorian-storage/Hijri-render policy, bilingual name fields | Retrofit cost is brutal |
| 8 | Map government-platform data requirements (Qiwa, GOSI, Muqeem, Mudad, ZATCA) into Employee/GRO/Billing schemas — manual-first, API-later | Schemas must mirror the real domain |
| 9 | PDPL compliance review beyond residency; security baseline (encryption, MFA, immutable audit) | Legal exposure + enterprise sales blocker |
| 10 | Resolve Google Calendar residency contradiction; define Requests-vs-Tasks boundary | Internal consistency of the doc |

---

## 7. Closing note

The instinct behind this document is right: constrain the architecture hard, then let AI-assisted development move fast inside the constraints. But today the constraints are mostly *slogans* ("own your data", "no cross-module access") without the mechanisms that make them true (RLS, lint boundaries, event bus, module skeleton). Slogans don't survive contact with a code generator — mechanisms do. Invest the next one to two weeks in the ADRs and the walking skeleton above, and the remaining roadmap gets dramatically safer and faster.
