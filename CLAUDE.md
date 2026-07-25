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
**Priority 4 — Requests + Tasks epic (4.3 + 4.4) COMPLETE.** Requests (REQ-01..04):
`req_requests` client-scoped table (the FIRST table clients WRITE) + the **dual-path
HTTP API** (staff cross-client, client reps own-client via `ScopedPrismaService`
+ RLS `WITH CHECK`) + **processing** (`request.process` status workflow, notify
the creator via `RequestStatusChangedEvent`) + the web console. Tasks (TASK-01..04):
`task_tasks` **staff-owned** table (internal work items, clients no access) + the
**HTTP API with the matrix own/assigned scope** (`task.read-all` lifts it) +
**Requests→Tasks via a `RequestCreatedEvent` domain event** (a request spawns an
unassigned task — the THIRD ADR-004 flow) + the Tasks web console. API suite
**218/218**; web typecheck+lint green. **Ten product screens** (login, audit,
clients, employees, settings, documents, expiry, requests, tasks) + the header
bell. **Two more ADR-004 event flows** (request→notify, request→task) on top of
document-expiry. **Priority 5 — Client Portal epic COMPLETE (PORTAL-01..04)** — a
dedicated `modules/portal` **delivery module** (client-facing surface, reads the
domain modules' services): `GET /portal/company` returns the caller's OWN company,
gated by `portal.read` (client-only permission) + the per-client
`flag.client-self-service` flag (403 when off). Chose a `/portal/*` module over
principal-aware `/clients` — avoids the ConfigurationModule↔ClientsModule DI cycle,
matches architecture module 10. **PORTAL-02: `GET /portal/employees[/:id]`** — rep
reads OWN employees redacted to **core + govdata:status** (no salary, no gov
identifier numbers; cross-client/unknown `:id` → 404). Activated the deferred EMP-02
`govdata:'status'` tier by **extracting the redaction mapper** (`toEmployeeResponse`
+ `EmployeeVisibility`) into `employees/domain/employee-view.ts` — one source of
truth shared by the staff controller and the portal. **PORTAL-03: `GET /portal/
documents[/:id][/:id/download]`** — rep lists OWN docs + gets a 300s presigned GET
URL; **AVAILABLE-only** (never pending/quarantined — a deliberate tightening vs. the
staff list); cross-client/unknown/non-available → 404; `toDocumentResponse` likewise
extracted to `documents/domain/document-view.ts`. Portal is still a leaf module
(imports Clients/Config/Employees/Documents/Storage — no cycle). API suite **239/239**.
**PORTAL-04: the client portal web UI** — three `(app)/portal/*` pages (company /
employees redacted / documents + download) wired to `/portal/*`, a `portal.read`-
gated client-only nav section in the shared shell (staff console untouched), the
login redirect fixed so reps land on `/portal/company` (was the staff `/clients`
they can't use), and flag-off → a calm "not enabled" state. **Eleven product screens**
now (the ten staff + the client portal). Verified live in the browser (ar RTL + en),
redaction confirmed at the payload, download → presigned 300s per-client URL; web
typecheck + lint green. **Priority 4 — Recruitment epic (4.1) STARTED: REC-01 done** —
`rec_vacancies` client-scoped table (a vacancy is an open position AT a client; clients
**read** their own, staff write — so `app_client` gets **SELECT only**, the one
deviation from the REQ-01 template) + staff-path `VacanciesService` (audited CRUD,
`resource: 'vacancy'`) + 3 seed vacancies. `modules/recruitment` registered. **REC-02: the vacancies HTTP API** — an
asymmetric dual-path resource (staff CRUD cross-client; client reps READ own via
`ScopedPrismaService`/RLS; all writes staff-only). `POST /vacancies/:id/status`
(`vacancy.approve`) advances the workflow (draft→open→filled/closed, workflow-validated
→ 400). The 5 `vacancy.*` perms are granted PER-ROLE, **not** via STAFF_BASE — GRO
Officer + Finance are excluded from recruitment (matrix; asserted in a test). 6 routes
in the isolation harness, 4 audited writes. Contracts add `vacancy.ts`. **REC-03:
`rec_candidates` STAFF-OWNED table** (a candidate's PII/CV is consultancy data —
clients get no access, so like task_tasks `app_client` is granted nothing) +
`CandidatesService` (create validates the vacancy + **derives clientId from it**,
audited `resource: 'candidate'`; list/getById/update). `stage` (applied→screening→
interview→offer→hired/rejected/withdrawn) defaults `applied`; the transition workflow
is REC-04. `vacancyId` + `cvDocumentId` are plain UUID refs, not FKs. 3 seed candidates.
**REC-04: the candidates HTTP API** — STAFF-ONLY (no client path; all 6 routes are
`staff` like Tasks) staff CRUD + a `candidate.advance` stage workflow (applied→
screening→interview→offer→hired; reject/withdraw from any active stage; workflow-
validated → 400). 5 `candidate.*` perms granted per-role (GRO/Finance excluded, no
client access — asserted in tests). 6 isolation routes, 4 audited writes. Contracts
add `candidate.ts`. **REC-05: `CandidateHired` → Employees** — advancing a candidate
to `hired` publishes `CandidateHiredEvent` (recruitment-owned) and Employees `@OnEvent`
creates the employee record (**4th ADR-004 flow**; Employees imports only the event
type, no DI cycle). Added `nationality` to candidates + a **hire-time guard** (400 if
absent) so the created employee is well-formed (`contractType: unlimited` default,
`active`; HR completes salary/govdata). Idempotent via `hired` being terminal (event
fires once → one employee). API suite **268/268**. **REC-06: the recruitment web UI** —
a vacancies console (list/create/status) + a **candidate pipeline board** (stage lanes,
per-card advance offering only legal moves, **Hire →** at the offer stage) over the
REC-02/04 APIs; nav gated on `vacancy.read`/`candidate.read`. Verified live: hiring a
candidate through the board created the employee end-to-end (REC-05 flow), both locales
(ar RTL). **Recruitment epic (4.1) COMPLETE — REC-01..06.** Thirteen product screens
(the eleven prior + vacancies + candidates); the 4th ADR-004 event flow live.
**Priority 4 — GRO epic (4.2) STARTED: GRO-01 done** — `gro_processes` client-scoped
table (tracks a government procedure — iqama renewal/exit-reentry/transfer… — for an
employee; clients read own status-only so `app_client` gets **SELECT only**) +
staff-path `GroProcessesService` (audited CRUD, `resource: 'gro-process'`). `employeeId`
is a bare cross-module ref (no FK); status defaults `not_started`; `dueDate` stored
Gregorian (Hijri = render). 3 seed processes; `modules/gro` registered. **GRO-02: the GRO processes HTTP API** —
an asymmetric dual-path resource (staff CRUD cross-client; client reps READ own
**status-only** — reference/notes/assignee redacted to null; all writes staff-only).
`POST /gro-processes/:id/status` (`gro.process`) advances the workflow (not_started→
in_progress→submitted→approved→completed, rejected→in_progress retry, →cancelled;
validated → 400). **No DELETE** — the frozen catalog is exactly `gro.read` + `gro.process`,
so a process is cancelled via status, not deleted. `clientId` is derived from the
employee (GRO imports Employees, one-way). Grants: gro_officer + company_admin process,
system_admin/hr_officer/read_only read, **Recruiter/Finance excluded**. 5 isolation
routes, 3 audited writes. Contracts add `gro.ts`. **GRO-03: the cross-module payoff** —
a `resultingExpiry` field on the process; on `changeStatus → completed`, if the type
maps to a govdata expiry field (iqama_issue/renewal→iqamaExpiry, exit_reentry→
exitReentryExpiry, work_permit_renewal→workPermitExpiry), GRO writes it back to the
employee via `EmployeesService.update` (GRO *operates on* Employees); every status
change notifies the assignee via `NotificationsService`. **Direct calls, NOT a 5th
ADR-004 event** — GRO already imports Employees (validation), so an event would cycle;
GRO "consumes Employees + Notifications" is the architecture's module-6 design.
`DocumentExpiring → GRO` auto-spawn deferred. API suite **283/283**. **GRO-04: the GRO
web UI** — a process console over `/gro-processes` (table with **dual-calendar Hijri
deadlines** — the epic's headline surfaced; create; status transitions; the completion
dialog captures a **resulting expiry** → PATCH + status → GRO-03 writes it to the
employee's govdata). Nav gated on `gro.read`. Verified live: completing an iqama-renewal
through the UI moved Ahmed Hassan's iqama expiry 2027→2029, both locales (ar RTL).
**GRO epic (4.2) COMPLETE — GRO-01..04.** Fourteen product screens. **Priority 5 —
Calendar epic (5.2) STARTED: CAL-01 done** — `cal_events` STAFF-OWNED table (staff
scheduling primitives — meetings/interviews; clients have no calendar access, so like
task_tasks `app_client` gets nothing) + `CalendarService` (audited CRUD, own-scoped
list with date-range overlap; `resource: 'calendar-event'`). `ownerUserId` is the own-
scope key; `clientId` optional context; start/end are timestamps stored UTC (Hijri =
render). Calendar is a delivery-layer module — owns its events, reads deadlines from
Tasks/Requests/GRO (CAL-02). 2 seed events; `modules/calendar` registered. **CAL-02: the Calendar HTTP API** —
staff-only own-scoped event CRUD (`calendar.read-all` lifts read/update/delete to all,
like Tasks; non-read-all → 404 on others' events; **delete is Company-Admin-only**) +
the **`/calendar/view`** endpoint that merges own events with **active** Tasks/Requests/
GRO **deadlines** for a `[from,to]` window, each source gated by its read permission via
`PolicyService.can` (all staff read tasks/requests; **GRO only for gro.read holders** —
a recruiter's view omits GRO). Terminal items excluded. 5 `calendar.*` perms
(`calendar.read` in STAFF_BASE). Calendar imports Tasks/Requests/GRO **read-only**
(one-way, no cycle). 6 isolation routes, 3 audited writes. Contracts add `calendar.ts`.
API suite **296/296**. **CAL-03: the Calendar web UI** — an agenda over `/calendar/view`
grouped by day (**dual-calendar Hijri headers**, kind-coded Event/Task/Request/GRO
items, event times / "Due · status"), month navigation, and create/edit own events
(delete shown only for `calendar.delete` holders). Nav gated on `calendar.read` (all
staff). Verified live: the gro_officer's agenda merged their own event with Request +
GRO deadlines, created an event through the UI, both locales (ar RTL); fixed a month-
boundary label bug (UTC-anchored the window). **Calendar epic (5.2) COMPLETE — CAL-01..03.**
Fifteen product screens. **GRO-05: `DocumentExpiring → GRO` auto-spawn** — the deferred
**5th ADR-004 flow**: a document nearing expiry auto-opens a GRO renewal process for its
employee (GRO is a second, decoupled consumer of the document-expiry event alongside
Notifications). Added `employeeId` to `DocumentExpiringEvent` (scan passes `doc.employeeId`);
GRO `@OnEvent` maps category→type (iqama→iqama_renewal, visa→work_permit_renewal), creates
a `not_started` process (dueDate = expiry). **Idempotent** via a new `sourceDocumentId`
column + `existsForDocument` — the event fires once per tier (60/30/14/7/1/0d), so at most
one process per document. An EVENT (not GRO-03's direct call) is the clean one-way case:
document-expiry doesn't import GRO, GRO imports only the event type (no cycle, the
CandidateHired pattern). API suite **301/301**. **Five ADR-004 flows now live.** **Priority 5 — Google Calendar
epic (5.3) STARTED: GCAL-01 done** — `modules/integrations` + the **Google Calendar
adapter** (ADR-009): the SOLE code path to Google, building a **whitelisted** `GoogleEventPayload`
(summary/description/start/end/location/attendees — no key for identifiers/compensation)
from a **typed** `CalendarInvitation` whose type has no free-form or PII field, so
data-minimization is **structural**. The adapter formats the title itself (`Interview —
<name> — <role>`) — callers never compose payloads. Pluggable `GOOGLE_CALENDAR_CLIENT`
seam with a `CaptureGoogleCalendarClient` dev impl (records outbound payloads, mints
`gcal-dev-<uuid>` ids); real Google client deferred. Attachments deferred (need the
real-client guard). API suite **305/305**. **GCAL-02: the invitations API** — `int_gcal_invitations` STAFF-OWNED
table (external Google id + reference code + **the exact whitelisted payload that left**,
JsonB) + `POST/GET/PATCH/DELETE /integrations/google-calendar/invitations` (`integration.
google-calendar`, staff-only). The service SENDS via the adapter first (which now returns
the payload it built — the sole builder), then persists + audits; the stored payload is
the adapter's, never rebuilt, so the service can't widen what leaves. Perm granted to
Company Admin + Recruiter + HR/GRO Officers (Finance/Read-Only/clients excluded). 5
isolation routes, 3 audited writes. Contracts add `integration.ts`. API suite **312/312**. **GCAL-03: the invitations web UI** —
an `(app)/integrations` console (schedule dialog + a table) with a **"What leaves the
system"** transparency view showing exactly the whitelisted payload sent (title/description/
start/end/location/attendees/external-id, nothing else) + a guardrail banner; nav gated on
`integration.google-calendar`. Verified live: scheduled an interview through the UI, the
transparency dialog showed `Interview — <name> — <role>` + `Ref: <code>` only, persisted
end-to-end, both locales (ar RTL). **Google Calendar epic (5.3) COMPLETE — GCAL-01..03.**
Sixteen product screens. **Priority 5 — Reporting epic (5.4) STARTED: REP-01 done** —
`modules/reporting`, the LAST delivery-layer module: owns no tables, reads every domain
module through their public APIs (Clients/Employees/Documents/Recruitment/GRO/Requests/
Tasks), nothing imports it (leaf at the top of the graph). The epic's idea is the **report
catalog**: six typed definitions each DECLARING `requiredPermissions`, so the matrix's
Reports row ("Recruiter R (recruitment) · GRO Officer R (GRO) · Finance R (financial)")
falls out of the existing permission catalog — **a report is readable exactly when its
underlying data is** (`payroll-cost` needs `salary.read`, `gro-workload` needs `gro.read`,
`compliance-expiry` needs `govdata.read` → Recruiter/Finance excluded). Reports:
workforce · compliance-expiry · recruitment-pipeline · gro-workload · service-operations ·
payroll-cost. ONE generic result shape (columns+rows+summary) so CSV export (REP-03) and
the web table (REP-04) stay per-report-code-free. `ReportingService` is deliberately
PERMISSION-AGNOSTIC (it computes; REP-02 gates) and takes an injectable `now`.
**Materialized views deliberately NOT used in v1** — an MV spanning several modules' tables
would break "own your data"; if a report is provably slow the MV belongs to the owning
module (decision recorded, not drift). **REP-02: the reports HTTP API** — `GET /reports`
(the catalog **filtered** to what the caller may run) + `GET /reports/:id` (run), staff-only
read-only. **TWO gates**: `report.read` (in STAFF_BASE — matrix gives every staff role R)
admits a caller; each report's `requiredPermissions` (ALL of them, AND) decides which are
listed and runnable — so a Recruiter's catalog is recruitment-shaped and `payroll-cost` is
neither listed nor runnable for them (403 naming `salary.read`; unknown id → 404; clients →
403). No client path — the matrix's "Client Admin R (own summary)" is a portal surface
(REP-05 decision). 2 isolation routes, 0 audited writes (auditing the EXPORT is REP-03).
Contracts add `report.ts`. **REP-03: the CSV export** (`GET /reports/:id/export?format=csv`)
— ONE renderer for all six reports (the payoff of REP-01's single table shape): RFC-4180
quoting + **UTF-8 BOM** (Excel opens Arabic correctly) + the summary appended after a blank
line. `report.export` is a **distinct capability** granted to every report-reading staff role
**except Read Only** (passive access ≠ bulk extraction), and the report's own data gate still
applies (Recruiter can't export payroll). **The FIRST audited READ in the system** —
`resource:'report', action:'export'`, written BEFORE the bytes return (a failed audit fails
the export), recording the **ACT not the payload** (`{reportId, format, rows, columns,
generatedAt}` — copying rows would duplicate gated salary data into a differently-governed
table). New **`AUDITED_READS`** allow-list in the audit harness (the write registry is
mutation-scoped; auditing reads by default would be a log, not an audit trail). API suite
**336/336**. **REP-04: the reports web console** — the catalog as report buttons + ONE generic
table rendering all six reports (the payoff of the shared shape) + summary tiles + a CSV
download shown only to `report.export` holders. The catalog arrives already filtered, so the
page never reasons about permissions. Column headers/cell values are stable keys translated
via `reports.column.*`/`reports.value.*` with **fallback to the API's English label** (a new
report degrades, never crashes); `compliance-expiry` cells changed to keys for that.
Verified live: hr_officer 6 reports · read_only 5 + NO export button · finance 3; moving a
seeded iqama expiry to +10d moved the Iqama row into `Due ≤30d`; CSV downloaded with its BOM
intact (`EF BB BF`) and wrote its audit row; both locales (ar RTL). **Reporting epic (5.4)
COMPLETE — REP-01..04. SEVENTEEN product screens. Priorities 2–5 DONE.** Also diagnosed a
PRE-EXISTING suite flake (~1 run in 3): supertest opens/closes an ephemeral-port listener per
call, so under 63-worker load a request can be answered by ANOTHER app instance (symptoms:
unauth `GET /documents`→200, `expected 401 got 404`, `Parse Error: Expected HTTP/`). App
authz verified deterministic (200 sequential unauth probes → all 401; ALS context is
correct); ~20 concurrent supertest calls reliably ECONNRESET. Isolation harness now lists
ALL offending routes; the harness fix itself is filed as a follow-up. **Remaining: the
real Google client + attachments (infra, deferred per ADR-009); AWS/OCI decision (ADR-006)
open.** WS-20/21 still blocked: AWS account fully restricted since signup (re-verified
2026-07-24: ECS throttle + RDS InvalidAction persist)
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
