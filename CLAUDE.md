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
   ADR-006 (rev. 1→5) is the cautionary tale: press releases lied, the
   console and official docs told the truth. ADR-006 rev. 5 (OCI) therefore
   asserts NOTHING: every service line is an unchecked box until seen in the
   account's own console.
5. Deviating from the frozen architecture requires surfacing the conflict,
   not improvising around it.

## Map

| File | What |
|---|---|
| architecture.md | Frozen v1.4 build contract |
| adr/README.md | Decision index (ADR-001..010, statuses) |
| BACKLOG.md | Task board + cards + working rules |
| ACTION-PLAN.md | Phased plan, DoD checklists with evidence rule |
| evidence/skeleton/ | Per-task proof (WS-01..) |
| docs/FIELD-MAPPING.md | ACTIVE: reference-system (Qiwa/GOSI/Muqeem/Mudad/Absher) Employee fields, sensitivity-tagged (0.8) — source for the Employees schema |
| docs/PROVISIONING-OCI.md | ACTIVE: OCI Riyadh provisioning runbook + verification checklist + status log |
| docs/PROVISIONING-AWS.md | SUPERSEDED (ADR-006 rev. 5) — kept for history + the OCI-06 teardown |
| docs/HANDOFF-WS20.md | HISTORICAL — the AWS resources it describes were torn down (OCI-06) |
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
ALL offending routes; the harness fix itself is filed as a follow-up. **INFRASTRUCTURE: ADR-006 is DECIDED (rev. 5, 2026-07-25) — OCI, home region
Riyadh, Jeddah second, OKE (managed Kubernetes) as the runtime.** Owner attached a hard
condition — *must be easily migratable later to AWS/Google/anyone* — recorded as its own
decision, **ADR-010 (cloud portability)**: six interface clauses each PAIRED WITH A DETECTION
METHOD (containers+K8s manifests in `infra/k8s/`; vanilla PG16 over a URL; object storage
**only** via the S3-compat API — no `oci-sdk` under `apps/`, greppable; Redis over a URL and
never source-of-truth; env-var config/secrets, no secret-manager SDK; no provider metadata
calls), explicit NON-goals (no multi-cloud abstraction, no avoiding managed services,
**Terraform is not portable and isn't expected to be** — the topology+runbook is), and an
**exit drill**: the WS-21 restore test passes only when a dump restores onto DIFFERENT
infrastructure and the app boots with only env changes. OKE was chosen over Container
Instances precisely for clause 1. OCI's two in-Kingdom regions dissolve the residency
compromise the AWS UAE interim carried (its no-real-data guard was legal; on Riyadh it's just
a production-readiness gate). ADR-006 rev. 5 **asserts no service availability** — every line
is an unchecked box until seen in the account console (the rev. 1 me-central-2 saga is cited
in the ADR as the reason). Epic: OCI-01 done (ADRs+runbook); **OCI-02 is OWNER-run** (signup +
console verification — I must not create accounts or enter credentials); OCI-03 Terraform,
OCI-04 manifests+deploy (closes WS-20), OCI-05 backups/exit drill (closes WS-21).
**OCI-06 DONE (brought forward, owner-approved): the AWS UAE environment is TORN DOWN — ALB,
target groups, ECR repos, S3 bucket, SSM secret, 3 SGs, 3 IAM roles + the GitHub OIDC provider
all deleted; AWS spend is now ZERO.** Inventory first proved nothing held data (ALB stuck
`provisioning` 6 days, 0 ECS/RDS, 0 ECR images, 0 S3 objects) — the environment never got past
the account restriction. Two empty log groups survive (`DeleteLogGroup` → ServiceUnavailable,
same restriction; 0 stored bytes = no cost) + the budget alarm, kept as a tripwire; the account
stays dormant. `docs/HANDOFF-WS20.md` + `docs/PROVISIONING-AWS.md` are now HISTORICAL (their
resource IDs are dead) and ci.yml's AWS deploy job is marked a DEAD PATH until OCI-04 replaces
it. Runbook: docs/PROVISIONING-OCI.md. Also remaining: the real Google client + attachments (infra, deferred
per ADR-009).

**UI/UX epic STARTED (2026-07-25) — the product surface is complete, the interface on top
is not.** Grounded in an audit of `apps/web` + design research; reviewed proposal (findings,
mockups, plan): https://claude.ai/code/artifact/728af94a-5bab-485c-89e6-76aef6a8a39c
**Owner decisions: "Today" becomes the front door · EVOLUTION not replacement (gold-on-neutral
identity stays; what changes is structure + state) · dark mode NOT shipped · charts stay
hand-rolled (no charting library — shadcn's charts are Recharts, ~100-130KB gzip + a forced
client boundary, and every chart we need is a div with a width or one `<polyline>`).**
Verified findings driving the plan: app is **unnavigable on mobile** (13 nav links in DOM, 0
visible, no menu button); **no home screen** + root URL still renders WS-01 scaffolding; **no
list has search/sort/paging**; **Arabic search silently returns ZERO results** for the common
typing variants (`احمد` does not match `أحمد حسن` — hamza omitted; also ة/ه, ى/ي, harakat,
Arabic-Indic digits) so any search box needs a normaliser or it's worse than none; **Base UI
never learns the app is RTL** (no `DirectionProvider` — it does NOT read `dir` from the DOM, so
select/menu arrow-key direction and popover alignment are LTR-handed in Arabic today).
Also settled by research: no ⌘K palette (16 screens don't need one; Latin mnemonic on an Arabic
keyboard) · no breadcrumbs (NN/g excludes 1-2 level hierarchies; Polaris deleted the component
for a single back action) · no Server Actions for forms (our Next app is a proxy to Nest — RHF +
the zod schemas already in `@hr/contracts` instead) · **no optimistic UI on writes** (RLS, field
authz, legal hold and workflow validation mean the server legitimately rejects) · toasts from
Base UI with a durable twin in the notification bell (that's the WCAG timing answer, already
built) · row actions always visible, never hover-only · skeleton on route entry only, then
dim-and-hold · detail via a `?peek=` side panel, NOT Next parallel/intercepting routes.
**Expiry tiers collapse 6 → 3 visual severities** (Critical 0-1d red / Action 7-14d orange /
Watch 30-60d GREY, no email) — six colour steps is using hue as a magnitude scale, and the
alarm-fatigue evidence (72-99% false-alarm rates) says non-actionable alerts are the mechanism;
keep six in the engine, show three. **UX-01 done** — semantic status tier
(`--status-{critical,warning,ok,info,neutral}-{,-surface,-line}`) SEPARATE from the brand +
`--background` lifted off pure white (cards now read as surfaces) + new **`hr/no-brand-in-status`**
lint rule (brand gold may not carry status meaning; scoped to `status` files — `Badge` colour is
decorative metadata, `StatusPill` colour is semantic, and they must not be merged). Contrast
MEASURED via `apps/web/scripts/verify-status-contrast.mjs` (all tones ≥5.4:1 on tint, ≥6:1 on
card). Measurement corrected three card assumptions: **dots draw from the tone, not the line**
(WCAG 1.4.11 exempts a labelled control's boundary, so `-line` is decorative); **unlabelled
fills must use the tone, not the surface tint** (tints are ~1.05:1 vs page — a bar would be
invisible); and **a monotonic greyscale ramp across 5 hues is incompatible with 4.5:1 on light
tints**, so non-colour redundancy comes from label + icon (what 1.4.1 actually requires) and
ordered data uses the existing `--chart-1..5` lightness ramp. **UX-02 done** — six primitives
(`StatusPill`, `Skeleton`, `Toast`, `Textarea`, `EmptyState`, `Popover`) + `lib/status-tone.ts`
(ONE table mapping all 7 domains onto exactly 5 tones — fixes the audit's inconsistency where
`terminated` shared a grey with `on_leave`). **StatusPill is deliberately NOT Badge**: Badge
colour is decorative metadata, StatusPill colour is semantic — same line the `no-brand-in-status`
rule draws. **`DirectionProvider` pulled forward from UX-03b** (3 lines in
`components/app-providers.tsx`): Base UI does NOT read `dir` from the DOM, so shipping a portalled
Popover without it would knowingly add a broken RTL surface — it was a latent bug on EVERY screen
since the first Select, on the default locale. Adoptions limited to three strict improvements:
the expiry dashboard (StatusPill + the 6→3 collapse — `expired` and `d7` were BOTH `destructive`,
i.e. already-expired looked identical to due-in-a-week), the notification bell (hand-rolled panel
→ Popover: gained aria-expanded/haspopup + Escape + focus-return + **0px RTL overflow at 472px**,
all measured), and both duplicated textareas. EmptyState/Toast ship consumer-less on purpose so
UX-06 (states across 21 screens) and UX-09 (StatusPill sweep) stay pure migrations. **UX-03 done** — `ui/data-table.tsx`
(search, sortable real-`<button>` headers with `aria-sort`, offset pagination WITH a real total,
empty-vs-no-results as separate states, always-visible row actions, 40px/14px density,
`tabular-nums`) + **NEW `packages/text` (`@hr/text`)**: the Arabic search normaliser, 18 tests.
**Why a shared package:** server-side search MUST use the same fold or client and API disagree
about what matches. The tests assert the naive `includes()` failure alongside the fix so the
regression stays visible if someone "simplifies" it away. Adopted on Employees (hardest screen);
**adoption re-scoped 8 screens → 1, sweep moved to UX-03c** (eight careful rewrites in one commit
= large diff, real regression surface, no way to verify each). Verified live: typed `احمد` →
found `أحمد حسن`. Landmines learned: literal invisible bidi chars in source fail
`no-irregular-whitespace` (use `\u` escapes — ironic, the file's own comment said so); and a
running Next dev server does NOT pick up a newly-linked workspace package (tsc resolved it, the
browser 404'd — restart the dev server). **`turbo run test` is currently RED for a pre-existing
reason: @hr/api reports 336/336 passing then exits non-zero on the documented ioredis
`Connection is closed.` teardown noise — reproduced 3/3 under turbo (load-sensitive).** **UX-04 done — the product finally has a
home screen.** `(app)/today`: an urgency-ordered WORK QUEUE (Overdue → Due today → This week →
Coming up), each section shown only when non-empty, Linear-"My Issues"-shaped rather than a
monitoring dashboard, because the objects are work items with owners and deadlines. **Adds no
data** — re-projects `/calendar/view` (which already merges own events + active Task/Request/GRO
deadlines, each permission-gated) by urgency instead of by day, plus expiring documents for
`document.read` holders. **Role-awareness MEASURED**: gro_officer gets gro+request+event,
finance and recruiter get NO GRO (matrix exclusion flows straight through) — so Finance gets a
shorter page, not four empty sections. **Deliberately NO KPI tile strip**: the four-ingredient
rule needs a baseline + trend, there is no history table, and a fabricated sparkline on a
compliance screen is worse than none — counts live in section headers (threshold-native +
click-through); a real strip needs a snapshot mechanism = a Reporting decision. **No greeting by
name** — `/auth/me` has no display name (UX-10 directory gap); shows the role instead of
inventing one from an email. Absolute date sits beside the relative one (compliance domain: "in
3 days" can't book an Absher appointment). The **root URL now redirects to /today** (was the
WS-01 walking-skeleton demo with no way into the app) and staff land there post-login. Two
defects caught while verifying: `/calendar/view` returns RAW enums and uses the GRO process TYPE
as the title, so `iqama_renewal`/`in_progress` were about to headline the most-read screen —
fixed by reusing each domain's existing label maps with raw-value fallback; and the dead `home`
i18n namespace was serialising "Walking skeleton" into EVERY page's HTML (next-intl ships the
whole messages object) — removed.
**UX-05 done — the app is usable on a phone.** The sidebar was `hidden md:flex`, so 13 nav
links sat in the DOM with **0 visible and no menu button**: not a degraded experience, a
product with no navigation below 768px. Now a **sheet** built from Base UI Dialog PRIMITIVES
(not a restyled `DialogContent` — that hard-codes `rtl:translate-x-1/2`, which tailwind-merge
won't override from a className), with the link list extracted into **one `AppNav`** that both
surfaces render (a second copy drifts, and invisibly on whichever surface you aren't looking
at). Measured at 375px: 13 links, 44px targets, aria-expanded/aria-controls, focus trap,
Escape + focus-return, scroll lock, **start-edge in BOTH locales from one class**
(`slide-in-from-start` resolves through `:dir()`), auto-close when the viewport crosses to
desktop, and **0px page overflow on every screen the seeded roles reach** (13 staff + 3 portal
+ login; `/audit` NOT swept — both admin roles are MFA-gated and no seed user is enrolled, so
reaching it would mutate seeded state). `DialogContent` gained `max-h-[calc(100dvh-2rem)]` +
`overflow-y-auto` — **`dvh` not `vh`**, since `100vh` excludes mobile URL-bar chrome; before
this the integrations form's submit sat **154px below the visible viewport** on a
`position: fixed` modal the page cannot scroll. 15 dialog grids across 9 screens →
`grid-cols-1 sm:grid-cols-2`. **The bug this card produced:** closing the sheet in the link's
`onClick` CANCELLED the navigation — `next/link` runs `startTransition(() => router.push())`
and closing unmounts the subtree owning that transition; bisected against the identical link
in the desktop sidebar, fixed by closing on **pathname change**. A deferred-close variant was
built, measured and **NOT shipped**: every timing came back a multiple of ~1000ms (**Chrome
clamps `setTimeout` in a non-foreground tab** — a landmine for any future in-browser timing),
so it couldn't be distinguished from the shipped behaviour; the one foreground production
reading was URL@18ms, sheet removed@171ms. Beyond the card: Today's rows reflow below `sm`
(the fixed date block had ellipsed titles to ~180px), and table scroll containers are now
keyboard-reachable (WCAG 2.1.1 — **205px of Employees columns were unreachable by keyboard**),
fixed in `DataTable` because UX-03c migrates every list onto it. Found-not-fixed:
`/ar/calendar` leaks a raw `open` enum (same class as the UX-04 defect), filed separately.
**UX-03c done — the DataTable sweep.** NINE lists migrated (clients, documents,
requests, tasks, gro, vacancies, **integrations** — a real list neither card had counted —
plus the two portal lists), so every list in the app is on `DataTable` except `/audit`
(`/expiry` is a bucketed dashboard and `/reports` a generic renderer, not lists).
**`/audit` is deliberately excluded**: it is the one genuinely SERVER-PAGED list
(`limit`+`beforeId`+`nextCursor`+"load more"), and DataTable filters a complete in-memory
array — migrating it would leave a search box that searches only the rows fetched so far
and reports "no results" for entries that exist, the same silent-failure class as
unnormalised Arabic search. It migrates when DataTable gets a real server-side mode.
**The sweep forced one component change:** five screens filter SERVER-side, so DataTable
could not distinguish filtered-to-nothing from an empty table and would have shown a
create/upload CTA to someone who had just filtered — added `filtersActive`, measured on
Documents (filter to `expiring before 2020` → no-results + a clear that resets the server
filter and refetches). Verified per role by logging in as each: **Clients as hr_officer
renders TWO headers, not an empty third** (no `client.update` → no actions column at all);
Requests `process`, GRO `change status`, Vacancies status-Select appear only for holders;
Tasks hides "assign to me" on tasks already yours; portal employees still redacts (no
salary, no identifier numbers, regex-checked in the rendered page). Arabic search
re-proved on migrated screens (`شركة الالف` → 2 rows, `احمد` → 2 rows, where `includes()`
returns false); GRO due-date sorting is correct only because it sorts raw ISO — all three
rows share a Hijri month name. Four dead `STATUS_VARIANT` maps died with the migration
(Requests' painted `resolved` solid and `closed` outline for two states that both mean
finished — the original audit finding), and two domains joined the tone table: `client`
(inactive = neutral, not a fault) and `invitation` (**cancelled = neutral, was
`destructive`** — it read as failure for an action that succeeded). Dev data restored:
the verification invitation deleted, the temporarily-enabled `flag.client-self-service`
row deleted. **UX-06 done — states everywhere.** Baseline: **34 bare `text-destructive` paragraphs
across 19 files**, EmptyState and Skeleton with exactly ONE consumer each, 403 handled on
three screens. New `components/ui/load-state.tsx` splits the two cases that want opposite
things: **`LoadError`** (the request FAILED → retry that re-runs the loader in place) and
**`NoAccess`** (403 = REFUSED → deliberately NO retry, names the missing capability).
**The defect this card existed to find: a dead API logged you out of the interface.**
`SessionProvider` redirected to /login on ANY `/auth/me` rejection — network error, 500,
timeout — so every screen's error-with-retry state was unreachable exactly when it
mattered, and the user landed on a sign-in form that also failed while holding a valid
cookie. Now only 401/403 goes to sign-in; anything else keeps you in the app with a retry
(and the guard's blank `return null` became a skeleton). **Retry proven to recover in
place**: API stopped → error state; API restarted → click retry → rows back, `performance`
navigation entries UNCHANGED (no reload). **`LoadError` decides by content** — a failed row
action (Documents' download) shares the same `error` state as a failed load, so with rows
on screen the failure is a banner and only an empty screen is taken over; both branches
verified by failing a single endpoint (`/api/requests` → 500) while the guard stayed
healthy. 403 verified by deep-linking `/ar/gro` as a **recruiter**: `restricted` variant,
`role="status"` (not alert — a refusal is not an error), no retry, names `gro.read`, shell
intact. Two defects caught while verifying: skeleton labels used each screen's own
`t('loading')` and `calendar`/`candidates` have no such key, so a screen reader was
announced the literal string **"calendar.loading"** (now one shared `states.loading`); and
**Settings' early return swallowed its own error** into a permanent grey "loading…", making
the retry below it unreachable. The 403 copy wraps the permission id in `<bdi>` rather than
adding a NEW instance of the bidi bug UX-08 will clean up. Form/mutation errors
deliberately stay inline next to their submit (34 → 16 remaining, every one a
formError/procError/stError or the login form). 
**UX-07 done — the seed produces a SCENARIO, not a smoke test.** Baseline: nearest document
expiry **99 days out** (all four expiry tiles read 0), **4 employees** (first page size is 25,
so pagination never engaged), `job_title_ar` empty on 3 of 4 (Arabic job-title search matched
nothing), **1709 orphan notifications** from test runs. Root cause: every date in `seed.ts`
was a HARDCODED ABSOLUTE written when it was near-future — the fixture didn't break, it **aged
out**, which is why the last three cards each had to sabotage data by hand. Dates are now
**relative to seed time** (`daysFromNow`), so the shape is stable whenever it runs. After: 5
clients (one archived), **39 employees**, 20 documents spanning EVERY alert tier (3 expired /
1 ≤1d / 3 ≤14d / 8 ≤60d), 9 requests + 10 tasks (several overdue; tasks across five owners +
unassigned), 9 vacancies across all statuses, 12 candidates across **all seven stages**, 9 GRO
processes, 5 notifications. Expiry dashboard now reads **3 expired · 3 ≤7d · 5 ≤30d · 4 ≤60d**;
Today shows **11 overdue · 12 this week · 11 coming up**; `محاسب` returns 3 accountants (the
exact query recorded as returning nothing in UX-03); pagination reads `عرض 1–25 من 39`.
**The mistake this card made:** the new clients got the obvious `33333333-…`/`4444…`/`5555…`
ids, and FOUR e2e specs use `33333333-3333-4333-8333-333333333333` as their sentinel for a
client that does NOT exist — three assertions went red because the id had become real. Moved
to a `c1000000-…` range, documented in the seed. (The risk I predicted, expiry-scan tests
reacting to near-expiry docs, did not materialise.) **A flow demonstrated itself:** after the
suite, gro_processes held 17 rows vs the seed's 9, the extra 8 carrying `source_document_id` —
GRO-05's document-expiry → GRO auto-spawn firing on the new near-expiry documents, one per
document, exactly as its idempotency guarantee says. Kept. API suite 336/336. 
**UX-08 done — Arabic finally has a typeface.** The app loaded `Inter({subsets:['latin']})` and
nothing else, and **Inter has NO ARABIC GLYPHS** — so the product's DEFAULT locale rendered in
whatever each machine fell back to (Geeza Pro / Tahoma / Noto Naskh). Measured: the same string
was 156.49px in "Inter", 156.32px in sans-serif, 154.99px in serif — three families, one width,
because all three resolved to the same fallback. Now **IBM Plex Sans Arabic** (self-hosted via
next/font, chosen to sit beside Inter — both neo-grotesques, so mixed runs like `Iqama — أحمد
حسن` don't read as two typefaces fighting) in **ONE composed stack**
(`var(--font-latin), var(--font-arabic), …`): the browser's per-CHARACTER fallback does the
routing, so there is no locale-conditional CSS to forget. **The trap that took three attempts:**
next/font emits TWO families per font — `Inter` plus a generated `"Inter Fallback"`, a local
Arial with `size-adjust` — and that generated fallback is a real system font that **covers
Arabic**, so it intercepted every Arabic glyph before the stack reached Plex (measured 482.41px,
matching neither Plex 500.95 nor OS 479.77). `adjustFontFallback: false` fixes it; my first
replacement (`fallback: ['ui-sans-serif','system-ui']`) re-created the same trap one line later,
since generics also resolve to Arabic-capable faces. Proof it applies now: **129.86px app stack
== 129.86px forced Plex** vs 106.73px OS (space-free word, so no cross-family space glyph skews
the number); Latin still Inter (312.23 == 312.23); **CLS 0.0000**; three real weights
(400/500/600 → 129.86/134.27/136.99px, none synthesised — `font-medium` appears 39× and would
otherwise have resolved down to 400 beside Latin at 500). Cost measured, not estimated: **~117KB
of Arabic outlines** across three weights, first visit only. **The bidi half was re-scoped DOWN
by measurement:** dual-calendar dates already render correctly (Hijri paints right of Gregorian),
hyphenated codes already render correctly (the strong-LTR prefix sets the run), and digits were
already consistently Latin (457 vs 0) — none touched. What was real: `TextField`'s prop was typed
**`dir?: 'rtl'`**, so an identifier field could not be marked LTR even in principle, and eight
government-identifier inputs (iqama/national-id/border/passport/work-permit/GOSI/Absher/IBAN)
inherited the page's RTL; the read-only `mono` identifier display now wraps values in
`<bdi dir="ltr">`. Also corrected the Arabic-Indic digits I introduced in the UX-07 seed. 
**UX-09 done — no more enum keys in the UI, and one workflow control.** Base UI's
`Select.Value` renders the RAW VALUE without a render function, so on `/ar/employees` the
create form's triggers read **`unlimited`** and **`active`** while the options below them were
correctly Arabic. Nine sites fixed — the highest-leverage being the **shared `SelectField`** on
employee detail, which already received `labelFor` and simply wasn't using it for the trigger,
so every govdata/salary dialog leaked. New **`hr/no-bare-select-value`** lint rule (alongside
`rtl-safe-classes`/`no-brand-in-status`) — and on its first run it **caught two sites I'd missed
by reading**, one being the client picker that rendered a raw **UUID** once selected; proven
both ways (deliberate violation → 1 error, restored → clean). `/ar/calendar` also leaked raw
statuses AND used the GRO process TYPE as the title (Today's UX-04 bug, second occurrence) —
that second consumer justified extracting **`lib/view-item-labels.ts`**, now used by both;
agenda scan for raw enum tokens returns zero. **Workflow control:** four screens each had their
own affordance for the same decision. New `components/ui/status-action.tsx` owns exactly
"given the current status, offer the legal next ones, translated" and NOT what happens after.
**Requests lost its dialog** (it held only a status Select plus the title/status the row already
showed — three clicks for one choice); **GRO kept its** because completing an expiry-bearing
process must capture the resulting expiry (GRO-03), but the row now picks the status and the
dialog asks for ONLY that field. Verified per role: hr_officer applied `مفتوح → قيد المعالجة`
in one click; a `submitted` GRO process correctly offered no "complete" (the workflow routes via
`approved`); completing an approved work-permit renewal opened the one-field dialog and saved.
Unification also exposed that the same control said two different things about terminal state
(vacancies/GRO `terminal: '—'`, requests/candidates no key) — now one shared `states.terminal`.
API 336/336, no API change. Next: UX-10 (staff-user directory, client-users admin, per-client
settings — the gap behind Tasks showing a truncated UUID and Today having no name to greet) or
UX-11 (accessibility pass).

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
- Tailwind v4 `@theme` only EMITS a utility when the class appears in scanned source — a new token is not a usable class until something references it. Verify with a real consumer, not by injecting a class at runtime.
- Do NOT run `next build` (prod) while the web dev/preview server is running — it clobbers `.next` and the dev server then throws `Cannot find module './NNN.js'`. Stop the dev server first, or verify only via the dev server (AUTH-08).
- Chrome throttles `setTimeout` to ~1s in a non-foreground tab, so ANY in-browser timing
  measured through timers is quantised to multiples of 1000ms (UX-05: readings of 999/1000/
  3999/5001/6000 looked like an app bug and were the browser). Foreground the tab, or don't
  claim the number.
- Closing a dialog inside a `<Link>`'s onClick CANCELS the navigation — `next/link` runs
  `startTransition(() => router.push())` and the close unmounts the subtree owning that
  transition. Close on pathname change instead (UX-05).
- BullMQ (NOTIF-01): the connection needs `maxRetriesPerRequest: null`. A Worker holds a blocking Redis connection whose teardown emits a benign "Connection is closed" unhandled rejection in EVERY app-creating spec → suite exit 1. Fix in place: producer (`QueueModule` in `AppModule`) is split from the worker (`DispatchWorkerModule`), which runs only in `MainModule` (main.ts) + the queue e2e. Keep workers out of `AppModule`.

## Commands

pnpm install · pnpm turbo run lint typecheck test build ·
pnpm --filter @hr/api db:migrate|db:deploy|db:seed ·
docker compose up -d (local PG+Redis)
