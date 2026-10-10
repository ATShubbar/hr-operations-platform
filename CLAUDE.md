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
| architecture.md | Frozen build contract — **v1.13** (ADR-011 self-service · ADR-012 LTR/prototype fidelity · ADR-013 six roles · ADR-014 leave · ADR-015 search · ADR-016 request thread · ADR-017 dependants · ADR-018 onboarding/final exit · ADR-019 client profile + Nitaqat) |
| adr/README.md | Decision index (ADR-001..019, statuses) |
| BACKLOG.md | Task board + cards + working rules |
| ACTION-PLAN.md | Phased plan, DoD checklists with evidence rule |
| evidence/skeleton/ | Per-task proof (WS-01..) |
| docs/FIELD-MAPPING.md | ACTIVE: reference-system (Qiwa/GOSI/Muqeem/Mudad/Absher) Employee fields, sensitivity-tagged (0.8) — source for the Employees schema |
| docs/PROVISIONING-GCP.md | ACTIVE: Google Cloud `me-central2` runbook (ADR-006 rev. 6) — UAT at uat.peopleandgro.com, PROD at app.peopleandgro.com; [owner]/[me] steps, cost checks, status log |
| docs/PROVISIONING-OCI.md | HISTORICAL — OCI (rev. 5), nothing created |
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
API 336/336, no API change. 
**UX-10a done — two surfaces whose APIs already existed.** The backlog line bundled TWO KINDS
of work, so it was split: client-portal user management and per-client settings are UI over
complete, e2e-covered, permission-gated APIs; the staff-user DIRECTORY has no API at all (no
`staff-user.*` permissions, no module) and is now **UX-10b**, a backend feature card —
contract-sanctioned (architecture.md line 78 names `staff-user.create`; the matrix gives
System Admin CRUD / Company Admin R) but deserving its own approval. **Portal users**
(`(app)/portal/users`): a Client Admin held `client-user.*` since CLIENT-03 and had no button;
the API derives clientId from the request context, so the screen cannot address another
company. Verified per principal — Client Admin sees the nav entry and only client A's user;
Client User and staff both get the `restricted` state naming `client-user.read`. Invite and
deactivate driven through the UI. **No hard delete**: the DELETE route exists but deactivation
preserves audit history. **Per-client settings** on `/settings` for `config.write-client`
(company_admin): this is why enabling `flag.client-self-service` in UX-03c meant writing SQL by
hand — now the flag flips `افتراضي النظام → تجاوز خاص بالعميل`, the DB shows 1 override row,
and Clear returns it to 0. **Two limits stated, not hidden:** origin is INFERRED by comparing
effective vs system (the API returns the effective map, not the override set — exact reporting
is a contract change), and only booleans get an editor (the catalog exposes no options/type
hints, so a generic editor would mean re-declaring every shape in the web app). **MFA:**
company_admin is MFA-gated with no enrolled seed user, so TOTP was enrolled for verification
and the secret CLEARED afterwards (9 users, 0 enrolled) — the seed still never fakes enrollment
(AUTH-06). Re-hit the documented landmine: a prod `next build` while the dev server runs
clobbers `.next` — it now presents as a `vendor-chunks/@base-ui…` module error rather than the
`./NNN.js` form recorded. 
**UX-10b done — the product knows who its staff are.** `auth_users` had **no name column** and
nothing listed staff users: one root cause behind three symptoms (Tasks assignee `a1b2c3d4`,
Audit actor a UUID, Today unable to greet — UX-04 had refused to fake a name from an email).
**The matrix conflict was surfaced, not improvised around:** the row "System config & staff
users" is System Admin CRUD / Company Admin R / "–" for six roles, yet an HR Officer must see
WHO a task is assigned to. Owner chose **option 2** — a separate, strictly narrower
**`staff-user.directory`** capability in STAFF_BASE whose endpoint returns ONLY id +
displayName + role (no email, no status, no MFA state), recorded as a **catalog addition, not
a matrix change**. The e2e spec asserts the directory's keys EXACTLY
(`['displayName','id','role']`) so a field added to the management shape cannot ride along.
API: nullable `display_name` migration; `StaffUsersService`/`StaffUsersController` in the
**auth** module (auth owns `auth_users`; `ClientUsersService` in `clients` is the mirror image);
`/auth/me` carries `displayName` (a lookup per app mount, not stored in the Redis session where
a rename would go stale); 6 isolation routes, 3 audited writes; **self-protection** — an admin
cannot disable or demote their own account (one system_admin seat, lockout is unrecoverable
without DB access), renaming yourself is fine; **deactivate, never delete** (sessions and audit
entries reference these ids). API suite **350/350** (336 + 14). Verified per role: gro_officer
greeted by name with NO staff-users nav entry; company_admin sees the directory and it is
**read-only — no add button, no row actions** (CRUD-vs-R enforced in the UI, not only the API);
Tasks with `task.read-all` shows 7 rows, every assignee a name, **zero id fragments**. Two audit
rows still show short ids — their actors are DELETED e2e helper accounts (verified by SQL: the
join returns NULL), which is the designed fallback and an argument for deactivating rather than
deleting real accounts. **Landmine:** admin-role e2e logins need `loginAsEnrolledStaff`, not
`loginAsStaff` (AUTH-06 MFA), or every request is 401.
**UX-11 done — the UI/UX epic is CLOSED.** Four gaps, each verified in the tree before the card
was written: `aria-current` appeared **0 times** in `apps/web` (no screen said which one you were
on); the calendar's agenda rows were `<li onClick>` — clickable with a mouse and by nothing else
(**2.1.1, Level A**); the app had **30 `<h1>`s and exactly ONE `<h2>`**, so every card title and
section header was a `<div>` and heading navigation had one stop per screen; and there was **no
skip link** past the 16 nav links that precede `<main>` (**2.4.1, Level A**). Fixes: `aria-current`
in `AppNav` — ONE change covering both surfaces (the UX-05 extraction paying for itself) — carried
by **weight as well as colour** (500 vs 400, so it survives greyscale) and matching nested routes
via `pathname === href || startsWith(href + '/')` (the separator stops `/portal/company` matching a
future `/portal/companies`); agenda rows → real `<button>`s **only where they do something** (2 of
16 rows; the 14 read-only Task/Request/GRO projections stay plain, because a focus stop that does
nothing is how a keyboard fix makes a page worse); `CardTitle` → `<h2>` with an `as` escape hatch
for the login card, which holds the page's ONLY title (login previously had **no heading at all**);
and a skip link proven to skip. **The obvious skip-link idiom is wrong here:** `sr-only` +
`focus:not-sr-only` zeroes padding under the focus variant, outranking `px-4 py-2` — measured, the
revealed link came back **91×20**; parked off-screen with a transform instead. **`tabIndex={-1}` on
`<main>` is what makes it skip** — a hash link to a non-focusable target scrolls and leaves focus
behind, so the next Tab returns to the nav (body→Tab→Tab→Enter→Tab now lands **inside** main, past
18 focusable elements). Beyond the four: the screens that are NOT lists never got UX-05's
`DataTable` scroll fix, and the tab stop had to go on **`<Table>`'s own container**, not the border
wrapper each page draws (putting it there = a focus stop that scrolls nothing) — **1061px of the
candidates pipeline board** and **351px of the expiry table** were mouse-only at 375px;
`role="region"` only when a name exists. **The `/calendar` 54px overflow was NOT introduced here** —
`git stash` + re-measure proved it pre-existing: `min-w-64` on the month label made that row 413px
inside a 343px column, missed by the UX-05 sweep. Verified across **14 screens × 2 locales**: exactly
one `h1`, exactly one `aria-current`, 0px overflow each. Deliberately out: route-change live region,
axe harness, `/audit` visual check (MFA-gated; same one-line change verified on `/reports` +
`/expiry`). No API change (0 files under `apps/api`). **UI/UX epic COMPLETE — UX-01..11.**
**UX-12 done (owner-reported):** Employees was the ONLY cross-client list with neither a client
column nor a client filter, while its own subtitle read "across all client companies". Adds a
sortable/searchable **Company** column (Arabic fold: `الالف` → 12 rows of `شركة الألف التجارية`,
where `includes()` returns false) and a filter **beside the search** — `DataTable`'s `filters`
slot, built in UX-03 and until now with **zero consumers** — with **no Apply button** (the Select
IS the action) and **server-side** narrowing via `?clientId=` (`/employees` is unpaginated, so
client-side would ship all 39 to hide 32; measured 39→7 in one request). Employees therefore
looks slightly different from the five screens that already had this (documents/requests/tasks/
vacancies/GRO use a form + Apply) — proving the shape on one screen beat sweeping six uninvited;
the conversion is a follow-up card. Clients now load on MOUNT and **unfiltered** (an archived
company's employees still need a name), with the active-only narrowing moved to the create
picker. The sixth column did NOT reintroduce overflow (0px at 375px; the scroll region is
keyboard-reachable per UX-11). **Landmine:** editing `messages/*.json` while the dev server runs
updates the SERVER render but NOT the client bundle — the page rendered `All` while the served
HTML said `All companies`, with `MISSING_MESSAGE` only in the console, so it read as a wrong
translation rather than a missing one. Restart the dev server (same family as the UX-03
newly-linked-package landmine).
**UX-13 done — one filtering idiom.** All six list screens now render their filters in
`DataTable`'s `filters` slot beside the search. **The card's premise was partly wrong and the
evidence says so:** it assumed five Apply-button forms; there were two (requests, tasks) plus
documents — vacancies and GRO already filtered on change, in a labelled row above the table.
**And UX-12's claim that `/employees` is the only list controller accepting `clientId` is
FALSE** — all six accept it via `@Query() query: unknown` + a zod schema, which a grep for
`@Query('clientId')` misses; every screen already filtered server-side, so this card is
presentation only. Two component changes made ONCE rather than six times: **Clear moved into
the toolbar** (it previously existed only in the no-results state — precisely when you need it
least) rendered only while narrowed; and the search input dropped to **32px** because `h-9` on
a `SelectTrigger` is **DEAD CODE** — the component carries `data-[size=default]:h-8`, an
attribute variant that outranks a plain utility and survives tailwind-merge (measured: search
36px beside filters at 32px, same failure family as UX-11's `not-sr-only` padding). Documents
needed a single `applyFilters(patch)` merging over current state — three independent setters
would race into a stale `load()`; verified date+category **COMPOSE** (20→8→6 docs, three
requests) rather than replace, and its date input fires on `change`, which for `type="date"`
means on commit, so no request-per-keystroke. Verified per screen: one row, all controls 32px,
0 stray Apply, one request per change, Clear absent before filtering and present after; Tasks
correctly narrows within its own-scope (hr_officer sees 4, not 10 — no `task.read-all`). Both
locales, 0px overflow at 375px (documents wraps to 4 rows). **The trade-off was raised and then
reversed by the owner** — visible labels back on documents first, then on the remaining five,
so ALL SIX are labelled and the compact experiment is over (employees uses the COLUMN HEADER's
word "Company"/"الشركة", not the aria-label's wordier "Filter by company"). They are REAL
associations, not decorative text: `<button>` is a labelable
element, so `<Label htmlFor>` pointing at the Select trigger is genuine, and the `aria-label` it
replaces was REMOVED rather than left to duplicate the accessible name — proven by clicking the
label and watching the Select open. **That exposed an alignment bug worth remembering:** with
`space-y-1.5` the Select wrappers measured **58px vs the date field's 52px**, so their triggers
sat 6px above the baseline — Base UI renders a hidden `position: fixed` input as a sibling of the
trigger, and `space-y-*` (a `> * + *` margin rule) still counted it; `flex flex-col gap-1.5`
makes it not a flex item at all. DataTable's toolbar moved `items-center` → `items-end` so a
labelled control and a bare search box share a baseline. **Found not fixed —
`/requests?status=` has NEVER worked:** `requestQuerySchema` declares `status`, the controller
parses it and keeps only `clientId`, and the service signature is `list(clientId?: string)`;
measured `?status=open` → 9 rows against 4 actually open. Pre-existing since REQ-02 and hidden
by the Apply button (you pressed it and watched nothing happen, which reads as "no matches") —
filtering on change made the non-response obvious. Tasks passes `status` through correctly;
vacancies/GRO filter status client-side.
**UX-14 done — that filter now filters.** Filters moved into an object on
`RequestsService.list`/`listForClient`, matching the shape Tasks already used; the controller
parses ONCE and feeds both paths. **`clientId` is deliberately NOT a filter on the client-rep
path** — RLS decides whose rows exist, and accepting one would read as though the caller could
choose (asserted: a rep passing another client's id still gets only their own rows). **The
test's load-bearing assertions are NEGATIVE** — "every returned row has status X" passes against
a filter that does nothing whenever the fixture is uniform, so it asserts the excluded row is
ABSENT and the filtered count is SMALLER; proven red by stashing `modules/requests` and watching
it fail, then green. Stated honestly: the rep-path test passes either way on this fixture (rep
A's requests are all open) — it is a regression guard, not a red-green proof. Verified per
status against true counts (open 4/4, in_progress 2/2, resolved 1/1, closed 1/1, cancelled 1/1)
and composing with `clientId` (2 rows). **API suite 352/352** (350 + 2). No web change — the
screen had been sending `?status=` all along.
**UX-15 done — the product has its real name and mark.** It had been identifying itself with a
placeholder ("HR Operations Platform"); the company is **PEOPLE&GRO**. One key fed every site,
so the rename is one line per locale: `common.appName` is **PEOPLE&GRO in BOTH locales** — a
company name is not translated, the same reasoning that keeps the wordmark Latin on the Arabic
login — and "HR Operations Platform" survives as a descriptor, never as the name;
`auth.signInSubtitle` became the slogan. **The measurement drove the design:** the artwork's gold
is **12.69:1 on the brand navy and 1.45:1 on our near-white sidebar**, i.e. invisible, so the
mark could not simply be dropped in. Owner chose the **navy chip** over a dark-mono wordmark —
the brand's colours stay exact and nothing about the logo is redrawn to suit our theme
(`BrandMark`, `plate={false}` for already-dark surfaces). The wordmark is **cut from the
artwork, not re-typeset**: an earlier pass set it in Inter, a neo-grotesque, where this is a
geometric sans (circular O, flat-crossbar G) — no weight would have matched, so the glyphs are
lifted at full resolution and **unpremultiplied** against the flat navy sky to keep their
anti-aliased edges. **Bug caught in the extraction:** the first cut left a median alpha of
**2/255** across the whole rectangle — sky sensor noise surviving as a ghost box, invisible on
navy and unmistakable on the favicon tile; fixed by treating anything under 6% as background,
not edge. The favicon is the **ampersand**, located by column-profiling the wordmark's alpha
into ten glyph runs. Verified: tab title `PEOPLE&GRO` both locales; sidebar mark 132×14 in a
`rgb(4,10,49)` chip with **7.73× pixels available** (the card's "14px of thin strokes may be too
fine" risk did not materialise); sheet 120×12, 0px overflow; **the mark is not announced twice**
— the sheet keeps an `sr-only` text title for the dialog's accessible name and marks the image
`decorative` (`alt=""`), measured. `riyadh-skyline.webp` + `lockup.webp` stay UNTRACKED with the
login-02 preview route, which is undecided — only what the product renders is committed.
**UX-16 done — the login page now uses the login-02 two-column layout** (owner reviewed a live
preview first, then approved). Form on the start side, brand panel on the end side from `lg`;
**`grid-cols-2` not positioned halves, so RTL mirrors for free**. **The block was NOT taken
as-is:** three of its elements have no counterpart here (no password-reset flow, no OAuth, no
self-signup — accounts come from a System Admin, UX-10b), replaced by one honest line shown on
the CREDENTIALS STEP ONLY; its `field` dependency was not installed either, since UX-13
standardised on `<Label htmlFor>`. **Below `lg` the panel is HIDDEN, not stacked** — it carries
identity, not information, and a phone should reach the password field without scrolling past a
photograph (measured at 375px: submit at 508 of 760, 0 vertical scroll, 0px overflow). Image fit
carried over from the preview: the artwork is 1.79:1 and the column ~0.84:1, so `object-cover`
shows only ~46% of the width — asset pre-cropped to the skyline at **1130×1340 (0.843)**, which
also kills the baked wordmark at any panel shape; name and slogan drawn on top. `BRAND_NAVY`/
`BRAND_GOLD` are SAMPLED from the artwork (the panel ground must match the photo's sky or the
seam shows; the rule's gold is not our `--primary`). **Duplication caught on first render:** the
slogan printed TWICE — form subtitle and panel — and wrapped over two lines in the narrow
column; `auth.signInSubtitle` became a functional prompt and the slogan moved to `auth.slogan`.
**Verified with a REAL sign-in** (hr_officer → `/ar/today`, the AUTH-08 stored-language redirect
intact) plus the MFA enroll step — and **without mutating state**: `/auth/mfa/enroll` writes the
pending secret to the REDIS SESSION only (`auth_users.mfa_secret` is set at verify), confirmed 9
users / 0 enrolled afterwards. `login-preview/` and `lockup.webp` deleted.
**UX-17 done — the nav is grouped and icon-led.** Owner supplied a sidebar they liked; a live
preview wired to our data was reviewed, then approved. **The source was REWRITTEN, not copied** —
it failed three of our own gates: every row was a `<div onClick>` (no keyboard — WCAG 2.1.1
Level A, the UX-11 calendar defect again), it was built on physical utilities that
`hr/rtl-safe-classes` rejects and that would draw its tree guides on the wrong side in Arabic,
and it carried `dark:` variants for a mode we deliberately do not ship. Now: 14 real `<Link>`s,
**zero `div` click handlers**, RTL mirroring with no direction-specific CSS. **Dropped:** the
workspace switcher (staff work across EVERY client at once — there is nothing to switch, and a
picker would misdescribe how the product scopes data; its slot now carries name + role from
`/auth/me`, real since UX-10b) and the ⌘K search row (the epic ruled a palette out). **Its
headline feature — collapsible children — has NO DATA here**, since our routes are flat; nothing
was invented to fill it. **No badge shipped** either: the preview wired one to unread
notifications, but the bell already owns that count in the same viewport and Today is a work
queue, not an inbox — the row markup takes a badge the day a count exists that is genuinely
about a screen. **The grouping (Clients / Operations / Recruitment) is EDITORIAL and the
component says so** — the routes imply no hierarchy, so it is maintained by hand; Today sits
ABOVE the groups (it is the whole queue, not a category of it) and administration sits at the
foot behind a rule. **An empty group renders nothing** — finance gets no Recruitment heading at
all, recruiter no GRO. **Bug the change introduced, caught by measuring:** the new `mt-auto`
footer had no viewport-height box, so "bottom" meant the bottom of the PAGE — Settings sat
**2243px** down a long screen; fixed with `md:sticky md:top-0 md:h-dvh` on the aside plus an
internally-scrolling nav (after: 792 of 800). Sidebar 240 → **260px** (icon column + identity
block; no label truncates, measured `scrollWidth` vs `clientWidth`); the sheet keeps its 44px
rows (WCAG 2.5.5) from the SAME component (the UX-05 rule).
**INFRA PIVOT (owner, 2026-09): provider is now GOOGLE CLOUD, Dammam `me-central2`** — reverses
ADR-006 rev. 5 (OCI), NOT yet recorded as rev. 6 (card GCP-01 awaits approval). Owner created
project **`peoplegro-prod`** and verified in its OWN console: Cloud SQL PostgreSQL (16 and 18
offered → **use 16**, local+CI are `postgres:16`), GKE, Memorystore, bucket, HMAC interop keys,
Artifact Registry, Workload Identity Federation — ALL available in me-central2. Open: GKE
Autopilot vs Standard, whether the project has an organization, cost (US-region estimate
$180–260/mo for GKE+Cloud SQL+Memorystore+LB; the $50 budget alert will NOT hold; levers: Redis
as a pod, no HA, and the big one — Cloud Run would be ~$25/mo but violates ADR-010 clause 1).
`gcloud` is NOT installed on this machine. Nothing provisioned. Prod needs a DOMAIN: the session
cookie is `secure` in production and Google certificates are issued for domains, not IPs.
**DESIGN-SYSTEM epic (DS) STARTED — the People & Gro redesign.** Source: the owner's Claude
Design project (design system + a 17-screen interactive prototype), read via the design
connector after `/design-login`; the prototype is 266 KB vs a 256 KB read cap and arrived
TRUNCATED (full download needed before screen cards). **Owner decisions:** visual first,
features later; **MONOCHROME** (reverses the UI/UX epic's gold-on-neutral); **employee
self-service INTO scope** (reverses architecture.md line 44 — its own architecture-amendment
card, ARCH-SS, sequenced first among features). The prototype is LTR-only (88 physical CSS
properties, 0 logical) and its soft status badge FAILS AA in every tone (2.86–4.13:1).
**DS-01 done — foundation:** `--primary` gold → neutral-900, page ground → white (surfaces
separate by RING now), radius scale already matched the system step for step; Card/Dialog
radius 14 + 16px + the 10% outset ring, controls radius 10 (Select 8), no press translate,
focus halo = the system's 3px neutral-400/50%. **Geist** joins ONLY as `--font-display`
composed with Plex (`adjustFontFallback: false`) — Latin h1 432.20 = Geist, Arabic h1 794.02 =
Plex (Arial 630.28); only `h1` takes it. StatusPill takes the soft SHAPE, keeps our AA tones.
**Pre-existing AA failure surfaced + fixed:** muted-foreground on muted measured 4.34:1 (the
system's pair AND ours before) → `.54`, now 4.64–5.06:1 on every ground. Verified 14 screens ×
2 locales × 2 widths + portal + login (CLS 0).
**DS-02 done — the shell:** sidebar 248px, 56px brand row + header, 36px rows / radius 8 /
16px icons, uppercase group labels (tracking **LTR-only**; DS-03 measured that Chrome 152 skips
letter-spacing on Arabic outright, so the guard is for other engines), a pinned **`NavFoot`** (Settings → initials avatar + name + role → sign-out icon;
sign-out LEFT the header) rendered by sidebar and sheet alike. **The header carries a location
line** (`header-location.tsx`: `PEOPLE&GRO / screen / record`; record screens publish their
name via `useRecordLabel`) — this **reverses the UI/UX epic's no-breadcrumbs decision** on the
owner's call; only the screen crumb links, and the current crumb has NO `aria-current` (the nav
row owns it — UX-11's one-per-screen). **Nav counts** (open requests, my unfinished tasks) via
`NavCountsProvider`: existing endpoints, **exactly 2 extra requests per app load on a prod
build** (dev shows 4 = StrictMode), **staff-only** because client reps also hold
`request.read`. Active row keeps its weight (owner-approved deviation). Verified 14 screens ×
2 locales × 2 widths + record crumb + 4 portal screens × 4.
**DS-03 done — the building blocks:** the table IS the card (radius 14 + 10% ring) and the
frame/header-band/cell/row classes are EXPORTED from `ui/table.tsx` (`TABLE_FRAME/HEAD/CELL/
ROW`) and used by `DataTable` too, so the two can't drift and pages no longer wrap tables in a
border; header = grey band, 12/16 medium, sentence case (4.64:1); rows 48px; cell text
**13px English / 14px Arabic** (`text-[13px] rtl:text-sm`, owner-approved — a page-level
`text-sm` on a cell would silently undo it). **Badge lost `destructive`** — status-by-badge no
longer type-checks; status is StatusPill (employee record converted). New **`StatTile`**
(caption / display-face figure / sub; `href` makes the whole tile the link; NO trend slot —
UX-04) on Expiry + Reports. Verified 15 routes × 2 locales × 2 widths + 16 portal. Next: the
screen cards (DS-04+, need the owner's full prototype download) or ARCH-SS; GCP-01 still
awaiting approval.
**ARCH-SS done — employee self-service is IN the architecture (ADR-011, architecture.md
v1.5).** Reverses v1.1's "employees are managed records, not users". Owner chose: **email +
password** (existing login) · **staff-invited** accounts (HR Officer/Company Admin,
`employee-user.*`) · employees see their **full own record** (profile, available docs, gov
identifiers WITH numbers, pay), read-only, changes via requests · **client reps see
employee-raised requests**. Third principal `employee` bound to an `employee_id`; the client
is DERIVED at sign-in (a sponsorship transfer follows the record). **Isolation is the
narrowest in the system — one record:** app scoping + RLS on `app.employee_id` (never the
company-wide client policies), and the harness probes a **same-client other employee**
(scope name `employee` — `self` is CONF-03's). Per-client `flag.employee-self-service`,
default off. Lives in a delivery module `modules/self-service`, which also orchestrates
invites and reacts to termination by calling Auth (Auth, a foundation module, must not
subscribe to domain events). Matrix has an "Employee (self)" column + an employee-accounts
row. **Known gaps:** password reset + real email are prerequisites (SS-06); no-email
employees excluded; ar/en only for an expatriate workforce. Build = SS-01..07.
**SS-01 done — the `employee` principal exists and is fenced.** `auth_users.employee_id`
(unique, bare uuid) + `PrincipalType`/`Role` `employee` (own migration — Postgres won't use a
new enum value in the adding transaction) + two CHECKs making a wrong account IMPOSSIBLE
(staff: no company/no record · rep: company/no record · employee: record/no company; `employee`
role ⇔ `employee` principal). **Found + fixed: the dual-path controllers (requests, vacancies,
GRO — 8 sites) failed OPEN** — `client_rep && clientId ? client : staff` sent every other
principal, and a company-less rep, down the CROSS-CLIENT path. Now **`src/auth/scope.ts`
`scopeOf(ctx)`** is exhaustive (staff · client(id) · else 403) and a source-scan test forbids
the inline form (proven red with a probe). Session/context/`/auth/me` carry `employeeId`; the
company is NOT stored — self-service resolves it per request (Auth can't read
`emp_employees`). Role holds only `session.end` (logout is permission-gated). Seed:
`employee-a@seed.hr.local` → Ahmed Hassan. **ADR-011 rev. 1 flags its own permission list as
UNSAFE for SS-03**: `employee.read`/`document.read`/… are what the STAFF list endpoints check,
and those ignore principal type. API suite **385/385**.
**SS-02 done — the database fences an employee to ONE record.** Separate LOGIN role
**`app_employee`** (`EMPLOYEE_DATABASE_URL`, in turbo `globalEnv` + CI) — NOT a role switch on
the client connection, because Postgres applies a policy `TO app_employee` to that role's
MEMBERS. SELECT-only on `emp_employees` + `doc_documents` (`employee_self` policies, SPIKE-001
`NULLIF` form); every other table "permission denied", every write refused.
`EmployeeScopedPrismaService.forEmployee(id)` / `.transaction(id, fn)` (id from the SESSION,
never input). Proven with an unfiltered query as one employee returning only their row + docs
(colleague, outsider and company-level docs invisible), unscoped = 0, pooled reuse = 0; and
proven RED by loosening the policy. **Harness principal fence:** every route outside
public/session/self/employee must 403 an employee — with `employee.read` temporarily granted it
reports `GET /employees -> 200`, so ADR-011's unsafe grant is now a CI failure. New harness
class `employee` (same-company colleague probe) has 0 members until SS-03 and says so; logout
reclassified `self`. API suite **401/401**.
**SS-03 done — `GET /me`, an employee's own file.** The employee role holds **`session.end` +
`self-service.read`** ONLY (ADR-011 rev. 2 — never `employee.read`/`document.read`/…, which the
staff list endpoints check without looking at the principal; the SS-02 fence enforces it).
New delivery module **`modules/self-service`** (imports Clients/Configuration/Employees, imported
by nothing): session employeeId → `EmployeesService.getSelf` (UNFILTERED read via app_employee —
the database picks the row) → per-client **`flag.employee-self-service`** (default off) read from
the RECORD each request (a transfer shuts access on the same session — tested) → terminated → 403
→ `toSelfProfileResponse` (whitelist in `employee-view.ts`; excludes Saudization class, Absher
ref, WPS, GOSI basis, timestamps; **IBAN → last 4**), pinned field-for-field by a test proven red.
`GET /me` is the harness's first `employee` route (same-company colleague probe now live; its
fixtures use their own company with the flag on, so no flag races). API suite **412/412**.
**SS-04 done — My documents.** `GET /me/documents` (available only, soonest expiry first, nulls
last) + `GET /me/documents/:id/download` (300s presigned link; ANY non-mine-or-unavailable id →
the same 404). `DocumentsService.listForEmployee/getForEmployee` read via app_employee, so the
DATABASE picks whose documents exist and the service adds available-only — proven as two layers
(dropping the status filter exposed only my own pending/quarantined/deleted; colleague/company/
outsider stayed 404 on RLS alone). Self document view is a whitelist (no storage key, legal hold,
uploader, size, status, ids, timestamps). Download proven END TO END: the presigned URL fetched
from MinIO returns the uploaded bytes. Harness: new class **`employee-read`** (path-param routes,
401-probed; the `client-read` counterpart); fixture docs TITLED with their owner's id so the
colleague loop covers list routes. API suite **429/429**. The supertest flake is hitting more
often as the suite grows (2 of 8 runs; one captured as `Parse Error: Expected HTTP/`) — the
REP-04 harness fix is worth scheduling.
**SS-05 done — My requests, the first employee WRITE.** `POST /me/requests` (type/title/
description only — `.strict()`, extras 400) + `GET /me/requests` (only what I raised).
`req_requests.requester_employee_id` + `app_employee` SELECT/INSERT under **`employee_raise`**:
raised-by-me AND `client_id` = my record's company (subquery that itself runs under
`employee_self`) AND open/normal/no due/no assignee — so a forged insert fails AT THE DATABASE
(proven: loosening it lets 5 of 6 forgeries through; the 6th still fails because RETURNING is
checked against `employee_own_read`). Request + audit in ONE app_employee transaction (audit
`clientId` explicit — an employee context has none), then `RequestCreated` spawns the task as
before; client reps/staff see it via existing screens. POST requires a new
**`self-service.create`** (a write behind `.read` would break resource.action). **Landmine
re-hit:** INSERT on `aud_entries` needs USAGE on `aud_entries_id_seq` — every raise 500'd until
a grant migration (AUDIT-02 learned this for app_client). API suite **455/455**.
**SS-06a done — employee accounts, and deactivation that ENDS sessions.** Measured first: a
disabled account kept working on its open session for up to 12 h — staff, client users, and
role changes too (the session caches the role). Sessions now keep a per-user Redis index
(`user-sess:{id}`) and **`SessionsService.destroyAllForUser`** runs on every disable / role
change (staff-users, client-users, employee accounts) and after any password set. New
`auth_account_tokens` (SHA-256 hash only, single-use, 7 d invite / 1 h reset; superseded links
are EXPIRED, not deleted — deleting them silently broke the reset throttle) + `UserStatus`
`invited` + `password_set_at`. `POST /auth/account/set-password` (@Public, token = credential);
staff `/employee-accounts/:employeeId` GET / `POST …/invite` / PATCH (`employee-user.*`,
Company Admin + HR Officer); `POST /me/password-reset` (employee accounts only, ALWAYS 202,
3/hour). Links carry the token in the URL **fragment**. Account mail goes through the ONE
`EMAIL_TRANSPORT` instance (Notifications now provides it; the worker reuses it).
`EmployeeTerminatedEvent` (Employees) → self-service closes the account (Auth never subscribes).
**SS-06 split: 06b = the web pages.** Production email still unconfigured. API suite **475/475**.
**SS-06b done — the account pages.** `AuthFrame` (the signed-out two-column frame, extracted
from login) now backs login + `/[locale]/account/set-password` + `/forgot-password`; login proven
UNCHANGED by measurement against a pre-refactor baseline (all relative distances identical; one
uniform −8px from the reworded note's second line). Set-password reads `#token`, strips it with
`replaceState`, and keeps it in **sessionStorage for the tab** — the language switcher otherwise
navigated to a token-less page (caught in verification); `no-referrer` on `/account/*`. Forgot
password answers identically for every input (character-identical, measured). Employee record
gets a **Self-service access** card (`employee-user.*`): status pill, invite/resend,
deactivate-with-confirm/reactivate; server refusals MAPPED to translations (no screen shows raw
API messages). Recruiters see no card and make no account request. For SS-07: an employee lands
on staff `/today` with missing `roles.employee` labels.
**SS-07 done — the "Me" screens; employee self-service (SS epic) COMPLETE.** `(app)/me` (My file:
who · documents with days-left pills + download · identifiers · pay with IBAN `•••• last4` ·
requests summary) and `(app)/me/requests` (own list + raise dialog), phone-first. AppNav has a
third branch (employees: *My file* / *My requests*, `exact` matching, no Settings); **AppShell
confines employees to `/me*`** and renders nothing while redirecting (0 staff calls); login lands
them on `/me`. Employee role + `notification.read` / `config.read-self` / `config.write-self`
(own-identity `self` routes — bell + language; ADR-011 rev. 3). Live: signed in through the form
as Ahmed Hassan → `/ar/me`, raised a request staff then saw, flag-off → calm "not available".
**A false fence failure (`GET /config -> 200` for an employee) did not reproduce in 8 runs and
is impossible by the exact policy check — the supertest flake can fake or MASK a security
failure, so the REP-04 harness fix is now urgent.** Production still needs SMTP. API **473/473**.
**DS-04 done — the shell IS the prototype now; ADR-012 records "pixel-exact".** After seeing
the running app the owner directed the portal match the Claude Design prototype **exactly**
(design, pages, functionality); the full prototype is versioned in **`design/`** (540 KB
`People & Gro Console.dc.html` — read it locally, the connector truncates at 256 KB). **ADR-012
(Accepted, architecture.md v1.6, revises ADR-005):** layout is **LTR in BOTH locales**
(`directionFor()` returns `'ltr'`; Arabic text still runs RTL within lines, every string still
translated) and status pills use the prototype's **soft colours, below AA** (2.86–4.13:1,
accepted; label + dot keep 1.4.1). Owner chose this OVER RTL/AA — recommended against, asked
directly. Kept on purpose: Plex Arabic, the real logo, the language switcher, and **logical
utilities stay lint-mandatory** (reversal = one line). Nav: one **Workspace** group in the
prototype's order/labels/icons (Overview · Calendar · Work queue · Requests · Leaves · People ·
Hiring · Clients · Roles and permissions · Reports · Audit trail), **Saved views** "coming soon",
a TEMPORARY **Other tools** group for screens the prototype has no entry for (Documents, Expiry,
GRO, Candidates, Google Calendar); header gains the prototype's search, **disabled + "Soon"**.
Owner rule: unbuilt parts are **shown, marked "coming soon"**, never omitted or faked
(`ComingSoonPage`; `/leaves`, `/me/leave`). "Viewing as" left out. **Next: ROLE-01** — the
prototype's 5 roles (Administrator · HR officer · GRO officer · Client manager · Employee) via
ADR-013, then DS-05+ one screen per card, then FEAT-* epics (billing in scope; editable
roles/permissions/field access LAST, with safeguards).
**ROLE-01 done — six built-in roles, decided (ADR-013, architecture.md v1.7; no code yet).**
Administrator (← System Admin + Company Admin) · HR officer (← HR Officer + **Recruiter** +
**Finance**) · GRO officer · **Auditor** (← Read Only; the prototype's "reads everything,
changes nothing") · Client manager (← Client Admin + Client User) · Employee. Matrix taken from
the prototype's `PERM_DEFAULT`, **narrowed where its `navDefs` is narrower** — the prototype
contradicts itself (HR/GRO audit R vs `adminOnly` Reports/Audit), so Reports + Audit logs are
Administrator + Auditor only (HR/GRO LOSE Reports). Kept narrower than the prototype: GRO docs
stay gov-category-scoped, client managers see vacancies not candidates, Auditor reads but does
not export reports. Added: **MFA for Auditor** too, and **NO default role** (today's
`@default(read_only)` would become pay visibility by accident). Portal users → Administrators
only, which needs a STAFF path that doesn't exist (`client-users` derives the client from the
caller), so **ROLE-02** builds it (additive) BEFORE **ROLE-03** migrates (enum, bundles, seed,
63 files mention legacy role names). Until ROLE-03 the ten roles still run the system.
**ROLE-02 done — Administrators manage any client's portal users.** New STAFF path
`/clients/:clientId/users` (company from the PATH) over the same `ClientUsersService`, so the
rules can't drift; `client-user.*` granted to system_admin + company_admin. **`scopeOf` refuses
non-staff FIRST** — client reps still hold `client-user.*`, so the guard alone would let a Client
Admin address another company by editing the URL (test proven red without it). No client record
page exists, so the UI is a **Portal users** dialog from the Clients row. Live: invited at Beta,
disabled → the user's session 200→401. 484/484 ×3. Next: **ROLE-03** (the migration).
**ROLE-03 done — six roles, end to end.** Migration rebuilt the `Role` enum (system_admin/
company_admin→administrator, recruiter/finance→hr_officer, read_only→auditor, client_admin/
client_user→client_manager), dropped the column default, and replaced the employee CHECK with
**`auth_users_role_principal_chk`** (staff ↔ 4 staff roles, client_rep ↔ client_manager,
employee ↔ employee). Bundles = the v1.7 matrix, pinned EXACTLY (missing AND extra) by
**`test/role-matrix.e2e-spec.ts`** — change a bundle and that spec, together with
architecture.md, or CI fails. MFA: **administrator + auditor**. `/client-users` and the
client *Portal users* screen are retired (Administrators use Clients → Portal users). **Seed
logins changed:** `staff-administrator`, `staff-administrator-2`, `staff-hr_officer`,
`-hr_officer-2` (ex-recruiter), `-hr_officer-3` (ex-finance), `staff-gro_officer`,
`staff-auditor`, `client_manager-a/-b`, `employee-a` (all `@seed.hr.local`). Matrix cell
corrected: HR/GRO Calendar is CRUD (read-all lifts writes — ADR-013 rev. 1). The per-report
gate is now proven with a NARROWED PolicyService (no v1.7 role exercises it). API 483/483.
Next: DS-05+ screen cards.
**DS-05 done — the People screen is the prototype's.** `/employees` rewritten: header + summary
("39 employees · sorted by the document that expires first"), Export register (disabled, "Soon"),
Add person; search + Client / Document / Time-left filters + Clear; the 2.2/1.5/1.4/1.3/1.5fr+40
table (avatar · EN name link + AR beneath · client · position/nationality · iqama Greg+Hijri ·
first-document chip red ≤7 / amber ≤14 / grey ≤30 / faded) sorted soonest-first, 50/page. Dates
come from the employee record (iqama, permit, passport, contract end); **insurance + licence are
"soon"** (not stored). Deviations: no-document people KEPT (last, "—" — the prototype would hide
21 of 39); Arabic name required (API); Umm al-Qura Hijri. New `ui/avatar.tsx` (DS sizes) owns
`initialsOf`. Landmine: a `<col>` IGNORES `calc()` widths — use percentages. Next: DS-06 Person
record.
**DS-06 done — the Person record (header, tabs, Profile).** `/employees/[id]` is the prototype's
record: back link, header card (avatar xl, EN name + status, AR name, position · company · dept,
**Start a procedure** — opens a REAL GRO process, not the prototype's flash — and **Terminate** for
`employee.delete`, owner-kept), seven underline tabs (new `ui/tabs.tsx` on Base UI Tabs), Profile =
Identity / Employment / Compensation as declarative field lists: each field belongs to ONE API group,
Save sends one PATCH per changed group with ONLY changed fields (fetch-spy verified). Every old field
kept (prototype fields first, then ours); Qiwa contract "—" (not stored). Masked in place for roles
lacking pay/IDs; the prototype's mask/omit/request switcher NOT shipped (owner). Self-service access
is Profile's last block. Family/Leave/Mobilisation "coming soon"; Documents/Open work/History = DS-07.
Landmine: importing a zod schema VALUE from `@hr/contracts` into a client page ships zod (+23 kB) —
import types only in the web app.
**DS-07 done — the record's Documents and Open work tabs.** Documents: one row per type (date from
the RECORD, file from the documents registry by category, file-expiry fallback), View/Download
(300s presigned), **Renew** inside 90 days writes the date WHERE IT LIVES (govdata vs core),
**Add document** = the DOC-02 presigned flow for this employee; insurance/licence "Not stored yet".
Open work: this person's open GRO processes, Resolve = the shared status control, completion of an
expiry type asks the resulting expiry (GRO-03); workflow rules extracted to `lib/gro-workflow.ts`
(shared with /gro). **Found + fixed a pre-existing API bug: every govdata EXPIRY edit returned 500
since EMP-02** — the write schema reused the response schema (plain strings) so `"2027-10-27"` hit
Prisma raw; the contract now coerces the 4 expiry fields (test red→green; API 484/484). Next:
**AUDIT-06** (record id on audit entries) → History tab.
**AUDIT-06 done — audit entries know their record; the Person record has its History.**
`aud_entries.resource_id` (nullable uuid + `(resource, resource_id)` index; NO backfill — history
starts 2026-10-04). Written by employee (own id), employee-user (the EMPLOYEE's id), document (doc
id) and gro-process (process id) writes. New leaf delivery module **`modules/history`** (imports
Audit/Auth/Employees/Documents/GRO, owns nothing, nothing imports it) serves
`GET /employees/:id/history`: the person's own + their documents' (deleted included) + their
processes' entries, newest first, 100 + `truncated`, actor NAMES via `UsersService.displayNames`,
**never before/after** (keys asserted exactly). Gated by new **`employee.history`** in STAFF_BASE —
owner-approved CATALOG ADDITION (the staff-directory pattern), full log stays audit.read. History tab
= the DS Timeline. Colleague-exclusion test proven red. API 489/489 ×3. Next: DS-08 (Requests).
**DS-08 done — Requests, as the prototype has them.** List (340px) beside detail; Approve and
assign = ONE `process` call (`open → in_progress` + assignee, from a popover of
administrator/hr_officer/gro_officer — never the auditor), Decline = `→ cancelled`, then an
assigned block + "Move to…" for the rest of the workflow. No new statuses; Ask for more detail /
thread / service level shown "coming soon". API: responses carry `requester: {name, kind}` (no
email; keys asserted exactly) via `UsersService.principals`, request writes carry `resource_id`,
and `GET /requests/:id/history` (curated, staff-only, in `modules/history`) feeds a **decision
trail** Timeline rendered for staff only. `?r=<id>` opens a request (read from `window.location`,
not `useSearchParams` — that needs a Suspense boundary or `next build` fails). **The SS-01 source
scan caught my display mapping** (`principalType === 'client_rep' ? 'client' : …`) — it forbids
the shape everywhere, not just on data paths; use an explicit map. API 493/493 (4 runs: one with
12 skipped = a spec's `beforeAll` flaking). Next: DS-09 (Hiring).
**DS-09 done — Hiring, as the prototype has it.** `/hiring` = the open-roles strip (draft/
open/filled vacancies: pipeline note, hired/headcount, Add candidate, Withdraw/Close/Open role)
over a six-column board (Applied · Screened · Interview · Offer · **Visa & mobilisation "coming
soon"**, never a drop target · Onboarded = `hired`). Moves by button, dialog or drag; **API: the
candidate workflow gained ONE step back** (screening→applied, interview→screening,
offer→interview; terminal stays terminal — `hired` already made the employee), test proven red.
Onboarding asks first (it creates the employee, REC-05). Open a role = create + open (title in
both languages); nationality is a picker (`lib/nationality.ts`, now shared with People/Person).
Health/target/mobilisation NOT on cards (no data; dialog says "Soon"). Client managers: their
roles, no board (matrix kept). `/vacancies` + `/candidates` redirect here. Found + fixed: DS-08's
New request dialog never reset (see landmine). API 494/494 (2 of 3 runs; the third hit the
supertest `Parse Error` flake in an untouched spec). Next: DS-10 (Clients + Client record).
**DS-10 done — Clients + the Client record (header, Overview, People).** `/clients` = card grid
(status in the band slot, sector·city·CR "soon", Saudi-share bar — by NATIONALITY, one colour,
labelled as such — Headcount / Expiring 30d / Open items, Open record). `/clients/[id]` = header
(View register → `/employees?client=`, Start a procedure with an employee picker — the shared
dialog's `choices` mode — and a ⋯ menu for Edit / Portal users / Archive-Restore), 8 tabs:
Overview (5 tiles, Nitaqat + Service panels "soon", expiry runway with an added **Overdue**
column) + People (first 12, soonest first); Requests/Open work/Hiring = DS-11; Records/Fees/
Commercial "soon". Figures computed in the browser (`clients/client-figures.ts`): headcount
excludes leavers, Open items = active GRO processes ONLY (tasks are own-scoped → per-viewer
counts), every figure matched SQL for all 5 companies. People's document rules extracted to
`lib/employee-docs.ts`. No API change. Next: DS-11 (the record's Requests/Open work/Hiring).
**DS-11 done — the Client record's Requests, Open work and Hiring tabs.** Requests: newest first,
each a link to `/requests?r=`. Open work = active procedures (person named, Resolve) + open
tasks AS THE VIEWER SEES THEM (owner decision: task.read-all → all, else own/assigned, with a
note; the Overview tile stays procedures-only). Hiring = pipeline bars over the board's six
columns + candidates in board order, Open board → `/hiring`. The procedure rows + Resolve +
GRO-03 expiry dialog were EXTRACTED to `components/gro-work-list.tsx` and both records render
them. Verified per role against SQL (tasks: HR 1 · GRO 2 · Admin 4 · Auditor 4, no buttons).
No API change. Next: DS-12 (Work queue).
**DS-12 done — the Work queue.** `/queue` merges active GRO processes, open/in-progress requests
and tasks (each source optional per role) into deadline bands (Past due / Today / 7 days / Later /
No due date) with search (Arabic fold), kind pills, client, Assigned to me. Per kind: assignee
picker for procedures + tasks (a request's assignee only moves WITH its status — REQ-05
follow-up), **Snooze = the real due date +7** (owner decision, audited), Resolve = GRO status
control (`GroResolve`, split out of `gro-work-list.tsx`) / Mark done / Open request. Nav Work
queue → `/queue`; `/tasks` in Other tools until DS-13's work-item dialog; New task form extracted
to `tasks/new-task-dialog.tsx`. Matched SQL for all four roles. No API change. Next: DS-13.
**DS-13 done — the work-item dialog; Tasks → Task history.** A queue row's title opens the
prototype's dialog: facts (person/requester, client, due chip + Hijri), per-kind detail, a
procedure step bar DERIVED from its real status (rejected = step 3, red), owner + Open record,
a task status/priority editor, Snooze, and the per-kind primary. Row + dialog share
`queue/queue-actions.ts` (`QueueItem` + `useQueueActions`). `/tasks` is **Task history**
(owner decision), defaulting to finished (done OR cancelled, filtered on the page). Bugs: I
reused `queue.kindLabel` (the pills' aria-label) as an object → `INSUFFICIENT_PATH`; and the
dialog overflowed 351px-in-343px on a phone because DialogContent's grid items default to
`min-width:auto` (fixed with `[&>*]:min-w-0`). No API change. Next: DS-14 (Calendar).
**DS-14 done — the Calendar.** `/calendar` = the prototype's Month (Sunday-first grid, Hijri day
numbers, chips + "+N more", coloured DOTS below `sm`, selected-day panel with "Schedule on this
day") / Week / Agenda, a person filter, and a legend (procedure deadline · request due · task ·
event; meeting/interview/portal types "coming soon" — no stored event type). **API: `/calendar/
view` items carry `ownerUserId`** (event owner / deadline assignee / null), test proven red. Days:
deadlines on their UTC date, timed events on the viewer's LOCAL day. Event form extracted to
`calendar/event-dialog.tsx`. Counts matched SQL (24 = 6+6+10+2). Found: calendar treats a
REJECTED procedure as finished while the queue doesn't (CAL-04 follow-up). Next: DS-15 (Audit).
**DS-15 done — the Audit trail.** `/audit` = tiles (Events today / Actors on record from the new
**`GET /audit/summary`**; Flagged critical "soon"), filters that ALL run server-side (search →
**`q`** ILIKE over action+resource; actor; category → **`resources=`**; window → `from`), day
groups with Hijri, server paging kept ("N+ events so far" on the last loaded day), and an entry
dialog listing changed fields before → after. Category is a fixed map in `lib/audit-category.ts`
(Payroll maps to nothing yet → disabled "soon"); severity and Export "soon" (AUDIT-07). Entries
now carry `resourceId`. Matched SQL (112 procedure rows, 33 for Omar, 1 for "archive"). Next: DS-16.
**DS-16 done — Reports.** `/reports` = the prototype's dashboard (`reports/dashboard.tsx`: tiles
Clients / Headcount+Saudi / Expiring 30d / Open items / Fees "soon"; Saudisation by client with
the band "soon"; 6-month expiry forecast; officer workload incl. Unassigned; service level against
each request's OWN due date; open procedures by TYPE — no portal stored) computed on the page from
the list endpoints (reusing `lib/employee-docs` + `clients/client-figures`), then **Detailed
reports** (REP-04 catalog; header Export report = the selected one, still audited). Every figure
matched SQL. Found: REP-01's Workforce counts archived clients + leavers (39 vs 36) — REP-06
follow-up. No API change. Next: DS-17 (Overview).
**DS-17 done — the Overview.** `/overview` = the prototype's home for STAFF (`/today` and the root
redirect there; `/today-preview` deleted): 4 tiles (expiring 30d · past due in queue · employee
requests · headcount), **Needs you first** (top 5 of the queue, title → work-item dialog, per-kind
Resolve), hiring pipeline, expiry runway whose cells open the cohort on People (`?doc=&band=`, plus
a new **Expired** band), client portfolio; Export register / Nitaqat band / dependants /
mobilisations "soon". "Cleared today" is DERIVED (finished + updated today, per viewer). Shared,
extracted: `queue/queue-items.ts` (`useQueueItems` — open work + order, ties → oldest first),
`clients/runway-table.tsx`, `hiring/pipeline-bars.tsx`. **"Under management" = not terminated AND
at an ACTIVE client** (`underManagement` in client-figures.ts, owner decision) — the Reports
dashboard now uses it too (36 → 35, 53% → 51%). Client managers → portal until **DS-18** (their
Overview). The DS-16 follow-up is **REP-06** (REP-05 was already reserved). No API change.
**DS-18 done — the client manager's Overview.** `/overview` picks by principal: staff →
`StaffOverview`, client rep → `overview/client-overview.tsx` (tiles: expiring 30d · requests with
the team · candidates in progress · headcount; Your requests (6 newest → `/requests?r=`); pipeline;
own runway + own portfolio row via the extracted `overview/portfolio-table.tsx`). Portal OFF
(`flag.client-self-service`, default off) → requests + pipeline still work, register figures show
the portal's "not enabled". Client managers land on `/overview`, first in their nav. **API: every
vacancy response carries `pipeline`** (counts per board stage, `VacanciesService.pipelines(ids)` —
counts by the ids the request ALREADY read on its own path, so a client's counts follow RLS;
`app_client` still has no grant on `rec_candidates`); `PipelineBars` now takes counts (`countsOf`
for staff). **Found + fixed:** a client manager could never raise a request — New request's company
picker reads `/clients` (403 for them), so Create never enabled; for client reps the picker is gone
and no clientId is sent (the API takes it from the session). API **507/507** ×2.
**DS-19 done — Roles and permissions.** `/staff-users` is the prototype's screen: six role cards
(accounts · Read/Write/Create/Delete/Granted counted from the REAL bundles; Edit/Delete/Add a role
"soon" — editable roles stay LAST), tiles (6 roles · 24 resources · 186 granted), and the REAL
read-only matrix (`staff-users/permission-matrix.tsx`: every action a resource has, dark when
granted; the walking-skeleton `example`/`scope-check` capabilities hidden), then STAFF accounts
(`accounts-table.tsx`: role menu with notes, ⋯ Edit name / Deactivate·Reactivate, own row locked,
Add a user; client + employee accounts linked to where they're managed). **API: `GET /roles`**
(`modules/auth/api/roles.controller.ts`, behind `staff-user.read`) returns `PERMISSIONS` +
`ROLE_PERMISSIONS` as-is + ACTIVE account counts — no second copy of the matrix anywhere. Test
imports must go through `modules/auth/public-api` (the boundary lint caught a deep import). API
**511/511** ×2.
**DS-20 done — My file.** `/me` is the prototype's: header card (avatar lg, names, job · company ·
joined), **documents by TYPE** (iqama/permit/contract/passport dated from the RECORD, file = the
matching available document → Download; unmatched uploads keep their own rows — DS-07's rule on the
employee side), identifiers + pay side by side, a requests strip. At 375 a fixed-column table clipped
the chip inside its card while the PAGE showed 0 overflow — measure a table against its CARD, not
only the page. **Found:** seeded documents have NO objects in MinIO (Download → `NoSuchKey` on seed
data; real uploads work) — SEED-01 follow-up. No API change.
**DS-21 done — Settings.** `/settings` = tabs **Access** (default; `settings/access-table.tsx`: the
prototype's field-access table, 6 groups × 6 roles, read-only) · **Preferences** (language, applies-
to-you, notification emails) · **System** (system settings, feature switches, per-client — only with
`config.write`/`config.write-client`). **API: `GET /access`** (`employees/api/access.controller.ts`,
`config.read-self` + `scopeOf` refuses employees; registry `client-read`) — DERIVED from the enforced
rules, which now live in ONE place: `staffVisibility(can)` + `PORTAL_EMPLOYEE_VISIBILITY` in
`employee-view.ts` (the employees + portal controllers enforce with them). Its spec cross-checks the
table against real `GET /employees/:id` responses. API **515/515** ×2.
**DS-22a done — Documents + Expiry folded into prototype screens.** Client record → **Records** =
company documents (`clients/[id]/records-tab.tsx`: docs with NO employee for the client, via the
existing `?clientId=` list; DOC-02 upload with no employee; download; delete w/ confirm, none on
legal hold) + the prototype's records content still "soon". `/documents` → `/clients`, `/expiry` →
`/overview` (redirect pages). **Run scan now → Settings → System** (`settings/expiry-scan.tsx`,
`expiry.run`; System tab now also shows for it). Running the scan CHANGES data (alerts,
notifications, GRO-05 auto-spawn) — snapshot counts first. No API change.
**DS-22b done — the Work queue's Finished view.** `useQueueItems(sources, 'finished')` (procedures
completed/cancelled, requests resolved/closed/cancelled, tasks done/cancelled; `finishedAt` = last
update) + an Open/Finished switch, month groups, `queue/finished-row.tsx` (read-only). The
work-item dialog is READ-ONLY for finished items (it had shown "19d over" on completed work and
offered Snooze / the task editor — caught in verification). `/gro` → `/queue?view=finished&kind=
procedure`, `/tasks` → `…&kind=task`. Only Google Calendar is left in "Other tools". No API change.
**DS-22c done — the "Other tools" nav group is GONE; the DS epic's screens are complete.** Google
Calendar invitations moved (`git mv`) to `settings/google-calendar.tsx`, shown in the System tab —
labelled **"Integrations"** for someone who holds only `integration.google-calendar` (HR/GRO
officers), "System" for the Administrator; `?tab=system|prefs` presets. `/integrations` → `/settings
?tab=system`. The staff nav is exactly the prototype's Workspace + Saved views. Found (GCAL-04,
pre-existing): invitation times convert in the BROWSER's timezone, not the chosen one. No API change.
**HARNESS-01 done — the API suite no longer lies.** Two flakes, both measured (3/10 runs red → 0/10,
517/517). (1) **The test HTTP client was answered by OTHER PROGRAMS**: with `app.init()` supertest
re-binds the app on port 0 with NO host (IPv6 wildcard) per request; macOS allows that while another
process holds `127.0.0.1:<port>`, and the connect to 127.0.0.1 goes to THAT process — a test captured
an SSH banner (`SSH-2.0-OpenSSH…`) as its "HTTP response". This was REP-04's 200-to-anonymous and SS-07's
false fence failure; REP-04's "63 workers" theory was wrong (files run one at a time). Fix: every spec
does `await app.listen(0, '127.0.0.1')`; `test/harness-listen.e2e-spec.ts` enforces it. (2) **BullMQ
5.80 crashes when a queue is closed while connecting** (init's `.catch(emit('error'))` fires after
close() removed all listeners → unhandled "Connection is closed."): `QueueShutdownGuard` in QueueModule
waits in `beforeApplicationShutdown` for EVERY queue (via DiscoveryService — NotificationsModule has its
own `dispatch` instance) to finish connecting. Red-guard proof: an unsafe employee grant still fails
the fence + matrix specs.
**GCP-01 done — going live is planned (ADR-006 rev. 6).** Google Cloud **`me-central2`**, project
**`peoplegro-prod`**, runtime **Cloud Run** (owner: cost) — a bounded **ADR-010 clause-1 exception**
(images stay plain Docker; clauses 2–6 hold; move-away = K8s manifests for the same api/worker/web/
migrate images; new rule: no `@google-cloud/*` in apps). **One project**, isolation by `uat-`/`prod-`
prefix + one service account per environment. **UAT** (seed data only) at **uat.peopleandgro.com**
first, **production** at **app.peopleandgro.com** later; DNS stays at **Hostinger** (owner adds one
record per environment). UAT email = capture only. The BullMQ **worker must be its own always-on Cloud
Run service** (min 1, CPU always allocated) or email + the 06:00 expiry scan silently stop — splitting
it out of `MainModule` is GCP-04. **Migrations create `app_*` roles with DEV passwords — rotate them on
any cloud DB.** No service-account key files ever (GitHub deploys via Workload Identity Federation).
Runbook: docs/PROVISIONING-GCP.md. Next: **GCP-02 [owner]** — install gcloud, sign in, enable APIs,
budget alert.
**GCP-02 done — and Dammam is gated (ADR-006 rev. 7).** Read-only checks: config/APIs/billing OK,
org policy allows all locations, but **Cloud Run in `me-central2` is refused by Google** ("Access to the
region is unavailable. Please contact our sales team") — the console LISTS Dammam, use is gated (rev. 3's
CNTXT lesson again). Compute in me-central2 has quota (72 CPUs); Cloud SQL/Memorystore creation there is
UNPROVEN. Owner: **UAT in `me-central1` (Doha)**, sample data only (no personal data → residency not
engaged). Production stays in-Kingdom, path open: **GCP-07**. Landmine: **gcloud needs Python ≥ 3.10** —
macOS's 3.9 fails; use `CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.14` in this shell.
**GCP-03 done — UAT infrastructure exists in `me-central1` (Doha).** Prices read from the official
Cloud Billing Catalog first (owner-approved). Artifact Registry `peoplegro` + a `dockerhub` REMOTE proxy;
Cloud SQL `uat-pg` (`peoplegro-prod:me-central1:uat-pg`, PG16 Enterprise Micro, encrypted-only, no
authorized networks, backups, deletion protection), DB `hr_platform`, user `migrator`; Redis on VM
`uat-redis` (e2-micro, **no external IP**, 10.212.0.2) via `infra/gcp/uat-redis-startup.sh` (password
from Secret Manager → root-only conf; pulls Redis through the proxy over Private Google Access;
`noeviction` for BullMQ); bucket `peoplegro-uat-documents` (private, CORS uat origin); secrets with
OWNER-generated values (never displayed); `uat-run`/`uat-redis-vm` with resource-scoped grants only.
UAT ≈ $57/mo (worker pool ≈ $36 of it, GCP-04). Next: **GCP-04** (worker split + keyless deploy).
**GCP-04 done — UAT runs on Cloud Run in Doha, deployed by every push to `main`.** One image, two
entrypoints (`dist/http.js` API, `dist/worker.js` BullMQ worker); `deploy-uat` (WIF, no key files) →
build/push `api`/`migrate`/`web-uat` → `uat-migrate` job (migrations + `app_*` passwords from secrets)
→ `uat-api` (INTERNAL) → worker pool `uat-worker` (REST v2, always on) → `uat-web` (public) → health
gate. Live at **https://uat-web-1048926106506.me-central1.run.app** (`/api/health` shows the commit;
no data yet). Going live exposed THREE pre-existing faults: **CI had been red for 30+ commits** (3
specs need the seed; the seed needs the workspace packages built; the document specs had no object
storage), **MinIO's images are gone** (CI uses `bitnamilegacy/minio` pinned by digest; docker-compose
still names `minio/minio` — follow-up), and the **worker could not authenticate to Redis**
(`redisConnection()` dropped the URL's password; local Redis has none). Worker job processing is
proven in GCP-06. Next: **GCP-05** (uat.peopleandgro.com; the owner adds the Hostinger record).
**GCP-05 done — https://uat.peopleandgro.com.** Doha REFUSES Cloud Run domain mappings (dry run: `501 Creating
domain mappings is not allowed in me-central1`), so UAT sits behind a global HTTPS load balancer (owner-approved
≈ $18.25/mo; IP 34.117.197.43; `uat-web-*` resources; HTTP 301 → HTTPS; Google-managed cert). Owner verified
`peopleandgro.com` in Search Console (TXT at `@`, kept — production reuses it). **Hostinger served a DELETED CNAME
for ~1.5 h** (its nameservers disagreed on the zone version); support purged it; the third certificate went ACTIVE.
UAT ≈ $75/mo.
**GCP-06 done — UAT IS LIVE with sample data.** The repo is PUBLIC, so the dev seed password is public: on UAT the
seed takes `SEED_PASSWORD` from the owner-generated secret `uat-seed-password`, and `prisma/seed-guard.ts` refuses
production mode without `SEED_TARGET=uat` + that password (production never gets either). Run it from GitHub →
Actions → **Seed UAT** (manual only; `seed-and-smoke` RESETS the data AND the seed accounts — the owner's
authenticator enrolment too — `smoke-only` just checks). `apps/api/scripts/uat-smoke.mjs`: 4 roles × allowed/
refused + a bucket round-trip + a worker-sent email — **25/25 on UAT**; the worker logged the email 2 s later. The
owner signed in as Administrator and enrolled their own authenticator. Next: feature work (FEAT-*) or GCP-07
(production region).
**UAT-01 done (owner decision, ADR-013 rev. 2) — UAT logins are simple and need NO authenticator.**
`admin@` / `hr@` / `gro@` / `auditor@` / `client@` / `employee@peopleandgro.com` (+ `admin2@`, `hr2@`, `hr3@`,
`client2@`), one shared password from the owner's `uat-seed-password` secret (never in code). The owner accepted the
stated risk (anyone guessing it is Administrator on UAT; sample data only, no outbound email). Containment is in code:
`auth/domain/uat-mfa.ts` honours `UAT_DISABLE_MFA=true` ONLY when `APP_WEB_ORIGIN` is the UAT address, so production
cannot lose MFA by a copied variable. Local dev/CI/e2e unchanged (`@seed.hr.local`, Administrator/Auditor enrol).
Smoke 33/33 on UAT, all six roles.
**UAT images fixed:** Next's standalone output omits `public/`, so `/brand/*.webp` (sidebar wordmark, login skyline)
404'd on UAT — the web Dockerfile now copies `apps/web/public`.
**LEAVE-00 done — Leave is IN the architecture (ADR-014, architecture.md v1.8).** Owner chose: the client manager
approves, then PEOPLE&GRO files (Administrator may approve on the client's behalf) · **calendar days** · the full
prototype balance (21/30 by service, monthly accrual from 1 Jan, carry-over ≤ 10, may go below zero = unpaid) ·
raisers = employee, client manager (own), HR officer, Administrator. Nine statutory types with caps (server refuses
over-cap and a second Hajj); only annual deducts. New `modules/leave` (`lv_leave_requests` + `lv_leave_entries`
ledger), catalog row `leave.read/create/approve/file/withdraw` — **employees never hold `leave.*`**, they use `/me/…`
under `self-service.*`. Not in Calendar/Queue (as the prototype). Labour Law references are the prototype's, NOT a
legal review.
**LEAVE-01 done — the leave data layer.** `lv_leave_requests` (ref `LV-0001…`, calendar-day CHECK `end = start + days − 1`,
status facts CHECKed) + `lv_leave_entries` (ledger: `taken` from filed requests, `carried` credits). `LeaveService`, three
paths (staff · client manager · employee), audited as resource `leave`; filing writes status + ledger in one tx; moves are
conditional updates (lost race → 409). **The DB fences each audience with COLUMN-LEVEL UPDATE grants + RESTRICTIVE
policies**: a client manager can never file or touch the ledger, an employee can only withdraw their own raise. Each policy
proven load-bearing (loosen → red). API **550/550**.
**LEAVE-02 done — the leave API.** `/leave` (dual path via `scopeOf`: list/get/raise/approve/decline/file/withdraw) +
`/me/leave` (self-service, `.strict()` body). Responses name the employee + raiser (`EmployeesService.namesOf`,
`UsersService.principals`) + per-caller `raisedByMe`. Bundles = the ADR-014 row, pinned by `role-matrix`. Filing is
staff-only twice (bundle + `scopeOf`). `LeaveStatusChangedEvent` → Notifications tells the raiser (never about their own
act); new notification category **`leave`** (own enum migration). Harness + audited-writes registered; the staff role
has NO DELETE on leave, so test cleanup uses the owner connection. API **563/563**.
**LEAVE-03 done — balances (ADR-014 rev. 1).** Pure `leave/domain/leave-balance.ts` (21→30 on the 5th anniversary,
the prototype's `floor(days/30.44)+1` months, **accrual from the hire date for a mid-year hire**, signed `available`) +
filing writes **one ledger entry per leave year** (leave crossing 31 Dec split by day). `GET /leave/balances[/:employeeId]`,
`GET /me/leave/balance`, `POST /leave/carry-over` (`leave.carry-over`, Administrator; optional `clientId`). The
**1 January 00:10 Riyadh carry-over job** runs on the worker (`LEAVE_QUEUE`, `LeaveWorkerModule` in MainModule only),
idempotent via a partial unique index. **Go-live caveat:** load real opening balances before production's first 1 Jan, or
everyone is credited the full cap. API **580/580**.
**LEAVE-04 done — the Leaves screen.** `(app)/leaves` = the prototype's: summary, one-card 4-cell tile strip, Requests
(list + detail: Hijri dates, wait line per role/state, basis, annual-balance block, same-company clash list, Approve/
Decline/File/Withdraw by permission) + Balances "next release"; Request leave dialog (date picker + Hijri echo — owner
chose it over the 16-week list; server refusals mapped to translations). Client managers' nav gains Leaves. `lib/leave.ts`,
`toneFor('leave')`. Verified live per role, en+ar, 0px overflow at 375. Fixed: filter squeezing tabs at 375; first-word
split turning «عبد الله» into «عبد». No API change.
**LEAVE-05 done — balances on screen.** Leaves → Balances (the prototype's 7-column table + search; staff rows open
`/employees/:id?tab=leave`), the Person record's Leave tab (balance bar, four figures, carried/pending notes, history across
years, Request leave pre-selected), Settings → System **Run carry-over** (Administrator). The Person record now honours
`?tab=`. Figures matched hand-worked balances for three people; carry-over ran twice (36 credited → 36 already). No API
change.
**LEAVE-06 done — the Leave epic (ADR-014) is COMPLETE (LEAVE-00..06).** `(app)/me/leave` (My leave: own requests +
Withdraw, My balance over `/me/leave/balance`, self-mode Request leave), the detail pane extracted to `leaves/leave-detail.tsx`
with an `audience`, nav badges (client manager → pending, staff → approved), a seeded leave scenario relative to today
(away today, a clash, an overdrawn person, carry-over, last year) + **`flag.employee-self-service` ON for seed company A**,
and a leave step in the UAT smoke check. Note: `configuration-client.e2e` deletes EVERY client setting — locally, re-seed
after the suite to get the flag back. API 580/580.
**SEARCH-01 done — global search (ADR-015, v1.9).** `modules/search` (delivery, leaf): `GET /search?q=` (`search.read`, all
roles), each kind gated by the caller's own access — people by name (`employee.read`) and by iqama/national ID/border/
passport/GOSI/work-permit number **only with `govdata.read`**; client managers own company (people only with the portal on,
never by identifier); employees own requests/leave (self-service on). An identifier match is AUDITED
(`search`/`identifier-lookup`, last 4 digits only). `@hr/text` is now an API dependency (server folds Arabic like the lists).
Header box = `components/global-search.tsx` (combobox, phone icon). API **591/591**.
**THREAD-00 done — the request thread is in the architecture (ADR-016, v1.10).** Owner: everything on a request's thread is
visible to everyone on it (NO internal notes); all who see it post except the Auditor (`request.comment`; employees via
`/me`); comments immutable; attachments (PDF/JPG/PNG ≤10MB) are the request's own `req_attachments`, scanned before
download; `info_needed` ("Ask for more detail") returns to `open` on the REQUESTER's reply; a per-type working-day
service level paused while info is needed (THREAD-04). **THREAD-01 done — comments on a request.** `req_comments` (client_id + requester_employee_id COPIED from the request;
SELECT+INSERT grants only → nobody, staff included, edits or deletes). RLS: RESTRICTIVE `client_comment` (the request must
match the row's client AND requester) + `employee_comment` (a request I raised). `request.comment` → Administrator/HR/GRO/
Client manager, NOT the Auditor (reads, can't post); employees post via `POST /me/requests/:id/comments`
(`self-service.create`). `RequestThreadService` looks the request up on the CALLER'S path (unseen → 404), audits
`request-comment` (length, not text), publishes `RequestCommentAddedEvent` → a staff comment notifies the creator, a
client/employee comment the assignee, never the author. Web: `requests/request-thread.tsx` (staff, client, employee) and
`/me/requests` is now list + detail (`?r=`). Comment bodies sit in `<bdi>`: under ADR-012's LTR layout an Arabic comment
otherwise printed its full stop at the start (`dir="auto"`/`plaintext` right-align it instead). API **601/601** ×3.
**THREAD-02 done — files on a request's thread (ADR-016 rev. 1).** `req_attachments` (PDF/JPG/PNG ≤10MB, ≤20 per request
— pending uploads hold a slot 15 min; client_id/requester copied; NO delete grant, UPDATE column-limited) + a **trigger**
`req_attachments_guard` for the only legal moves (pending→available|quarantined|**rejected**, available→removed), binding
staff too + RESTRICTIVE `attachment_starts_pending`/`client_attach`, `employee_attach`. `RequestAttachmentsService` (one
service, `AttachmentPath` staff·client·employee): create → presigned PUT → **confirm** (uploader only: missing 400, >10MB
rejected, virus scan quarantined, first bytes ≠ declared type rejected) → 300s download named `inline; filename*=` →
remove (uploader only, soft: "File removed by …" line). Non-uploaders get 404 on pending/refused files. The scanner seam
is now Storage's **`FILE_SCANNER`** (moved from Documents). UAT smoke gains an attachment round-trip (a seeded file needs
IAM for the seed account → SEED-01). API **617/617**.
**THREAD-03 done — "Ask for more detail" (ADR-016 rev. 2).** `info_needed` (own enum migration) +
`req_requests.info_returns_to` (CHECK: present ⇔ info_needed, only open/in_progress). Staff `process` with a REQUIRED
`note` (contract refine; the note is posted as the asker's comment in the same tx, ONE notification "More detail needed
on your request"); audited `ask-info`. The requester's side replying — the client manager, or the employee who raised it
— with a comment or a CONFIRMED file returns it **to where it was** (`requester-reply.ts` `returnIfWaiting`, in the
reply's own fenced tx; audited `info-returned`); staff replies never do. Trigger `req_requests_info_guard`: app roles
can't enter info_needed and may leave only to the recorded status; `app_employee` gets UPDATE on just status/
info_returns_to of a waiting request it raised. Web: Ask dialog (required note), `InfoNeededBanner` (staff/requester),
amber `warning` tone, counted as open in queue/dashboard/My file, Service operations column `reqInfoNeeded`. API
**632/632**.
**THREAD-04 done — service level per request type (ADR-016 rev. 3); the request-thread epic (THREAD-00..04) is
COMPLETE.** `@hr/dates` gains `addWorkingDays` / `workingDaysBetween` / `dayIn` (pure, unit-tested). Setting
`request.service-level-days` (system, strict, every type 1–60; defaults Letter 2 · Certificate 2 · Document 3 · GRO 5 ·
General 1), edited in Settings → System → Service levels (`config.write`). `ServiceLevelService` (Requests, imports
Configuration): a new request without a due date gets one in its company's `working.week` and the system `timezone` —
staff/client paths in the insert, the EMPLOYEE path right after the raise commits on the staff connection
(`service-level-set`; SS-05's fence still forbids an employee choosing one). The pause: `info_needed_since` (CHECK with
`info_needed`); a staff hand-exit extends the due date in its tx, a requester's reply extends it AFTER its commit on the
staff connection (the client/employee roles never write a due date) — audited `service-level-paused`. Responses carry
the type's CURRENT `serviceLevelDays` (SS-05's pinned self whitelist gained it on purpose). New requests only. API
**645/645**.
**REQ-06 done (owner: "nothing") — client managers no longer see id fragments on Requests.** The page named companies
(`/clients`) and assignees (`/staff-users/directory`) from STAFF-only lists and fell back to `id.slice(0, 8)`; now client
managers get no company (it is always their own) and "Being handled by PEOPLE&GRO" instead of an assignee, and the page
doesn't request either list unless the viewer is staff. Staff "Open work queue" fixed `/tasks` → `/queue`.
**SEED-01 done — seeded documents have real files.** `prisma/seed-files.ts` builds a valid one-page sample PDF
("Sample data - not a real document") per seeded document and writes it through the S3 API (`SeedFiles`, same bucket
rule as `StorageService`); two sample request attachments too. `seedStorageFor(env)` (seed-guard): local MinIO by
default, but on UAT every `STORAGE_*` must be supplied or the seed refuses. CI now starts MinIO BEFORE seeding.
`uat-seed.yml` passes the bucket settings from `uat-env.yaml` + the two storage secrets — owner-approved grant:
`uat-seed` may read `uat-storage-access-key`/`-secret-key`. Smoke checks a seeded document + attachment download.
**REQ-05 done — reassign an approved request without moving its status.** `POST /requests/:id/assign` (`request.process`,
staff; in_progress/info_needed only; never null; audited `assign`, trail "Reassigned"). The assignee must be an ACTIVE
STAFF account whose role holds `request.process` — checked on `assign` AND `process` (which used to take any id).
`RequestAssignedEvent` tells the new assignee (also on Approve and assign), never when you take it yourself. Web: the
queue row's picker covers approved requests (eligible roles only), the request detail has Reassign. API **654/654**.
**ASSIGN-01 done — one assignee rule for every work item.** Auth `UsersService.isActiveStaffWith(userId, permission)`:
an ACTIVE STAFF account whose role holds the kind's permission (request.process / task.update / gro.process — all three
held by Administrator, HR officer, GRO officer today). Requests, tasks and procedures all call it (create + update;
clearing to null still allowed for tasks/procedures). The person handed a task (`TaskAssignedEvent` → Notifications,
category `task`) or a procedure (GRO notifies directly, category `general`) is told, never self, never on a re-save with
the same assignee. The queue picker offers only `ASSIGNEE_ROLES`. API **658/658**.
**TASK-05 done — a spawned task is due when its request is, and follows it.** `RequestCreatedEvent` carries `dueDate`
(the employee path now publishes the row WITH the system's date); new `RequestDueDateChangedEvent` (after commit, only
on a real change: staff update/snooze, client update, `process` leaving info_needed, the post-reply pause in
ServiceLevelService) → Tasks moves the request's OPEN task (audited update), never a finished one. The tasks module's
own working-day copy is DELETED — `@hr/dates` is the only implementation. API **663/663**.
**CAL-04 done — ONE definition of "finished".** `@hr/contracts/work-status` (`FINISHED` + `isFinished(kind, status)`):
task done/cancelled · request **resolved**/closed/cancelled (owner) · procedure completed/cancelled (**rejected is open**
— the workflow retries it). Calendar view, reports, queue, both Overviews, client figures, dashboard and the Open-work
tabs all use it (the API and web had disagreed). A unit test makes every workflow status DECIDED — a new status fails it
until someone chooses. The web imports the zod-free SUBPATH (`@hr/contracts/work-status`), never the package root
(DS-06 landmine; measured: no zod in the queue page's scripts). API **665/665**.
**REP-06 done — one headcount rule.** `@hr/contracts/headcount` `isUnderManagement(employmentStatus, clientStatus)` (not
terminated, at an ACTIVE company — DS-17's dashboard rule) now drives the Workforce report too: active companies only
(owner), headcount/Saudi/Saudization over people under management, leavers still shown in the Terminated column. The
web's `underManagement()` calls the same function; an e2e test checks the report's totals equal the rule over the whole
DB. Seed: report 39 → 35 = the dashboard tile. API **668/668**.
**GCAL-04 done — invitation times use the chosen zone.** `@hr/dates` `zonedTimeToUtc` / `utcToZonedWallClock` /
`isValidTimeZone` (Intl-based, DST: gap → forward, overlap → first). The schedule form converts with the CHOSEN zone
(it used `new Date(datetime-local)`, i.e. the browser's zone) and refuses unknown zones; the transparency view shows the
local time beside the UTC instant. No API change.
**AUDIT-07 done — the Audit trail exports, and every entry has a severity.** `audit.export` (Administrator +
Auditor — the Auditor's one named exception to "changes nothing"; reports stay read-only for them). Severity is DERIVED
from (record type, action) in ONE table, `modules/audit/domain/severity.ts` — never stored, so an edit re-grades the
trail; `whereSeverity()` makes it a server-side filter; a test asserts every audited write pair is graded on purpose.
`GET /audit/export` (in `modules/history`) = the list's filters minus paging, ≤10,000 rows newest first, CSV with FULL
before/after values (owner), audited Critical BEFORE the bytes return with `{filters, rows, truncated, sha256}` — the act
and a fingerprint, never the rows. Shared CSV writer `src/csv/csv.ts` (REP-03 now uses it). Screen: pill on notable/
critical rows only, Severity filter, Flagged critical = today's count + a button into them, Export for holders with a
truncation note. Live: tile 304 = SQL 304 = file rows; the downloaded bytes' SHA-256 = the audit row's. API **676/676**.
**DEP-00 done — dependants are IN the architecture (ADR-017, v1.11).** Owned by Employees (`emp_dependants`: spouse/son/
daughter, names, birth date, iqama number, iqama/passport/insurance expiries; NO `client_id` copy — it would go stale on a
transfer; removal soft). Staff read with `employee.read`, the iqama number only with `govdata.read`; **`govdata.update`
holders change them** (Administrator, HR officer, GRO officer — the prototype gates Add on the ID fields; my first draft's
`employee.update` would have shut the GRO officer out, corrected at review). The employee sees their own incl. numbers
(self-service, `employee_self` fence); **client managers nothing** (no `app_client` grant). Audited `dependant`,
`resource_id` = the sponsoring employee (History), severity notable. Expiries on the record ONLY (no alerts/runway yet);
fees → Billing ("coming soon"). No new permission. Build: DEP-01 table · DEP-02 API · DEP-03 Family tab · DEP-04 My file.
**DEP-01 done — `emp_dependants` + `DependantsService`.** No `client_id`; CHECKs (non-blank name, removed_at ⇔ remover);
`app_staff` SELECT/INSERT/UPDATE — **NO DELETE, even for staff** (soft removal); `app_employee` SELECT under `employee_self`;
`app_client` NOTHING. Service (Employees): `listFor` (spouse, then children oldest first) · `listForSelf` (app_employee) ·
`add`/`update`/`remove`, audited `dependant` against the SPONSOR with a non-sensitive snapshot (update lists changed FIELD
NAMES, never the iqama number or dates); severity notable. 404 other sponsor's dependant, 409 removed. Seed: 6 dependants on
Ahmed Hassan (iqama +45d), Syed Ali, Rajesh Kumar (expired −6d). Six red proofs (4 fences + snapshot + sponsor check).
API **687/687**.
**DEP-02 done — the dependants API.** `GET/POST /employees/:id/dependants`, `PATCH …/:dependantId`, `POST …/:dependantId/remove`
(204) — read `employee.read`, change `govdata.update`, STAFF ONLY via `scopeOf` (proven with a WIDENED policy: a client
manager granted both perms is still 403 — without that test the check was not load-bearing, since no client role holds
them). `GET /me/dependants` (self-service, own family incl. numbers, app_employee read). Contracts `dependant.ts`: STRICT
writes, date-only strings that must be real, iqama `^2\d{9}$`; whitelisted responses, `identifierVisible` + `iqamaNumber:
null` for non-`govdata.read` readers (narrowed-policy test). Harness fixtures NAMED with the sponsor id. API **700/700**.
**DEP-03 done — the Person record's Family tab.** `family-tab.tsx` (the prototype's: header "N dependants sponsored · annual
dependant fees coming soon", one card per dependant, iqama grouped / "Not yet issued" / masked `••• ••• •••` with sr-only
text, 3 document rows with Greg+Hijri, days-left chip, Renew ≤90d writing one field) + `dependant-dialog.tsx` (Add/Edit,
sends ONLY changed fields; a masked number is never sent unless retyped). ⋯ Edit/Remove need `govdata.update`; Auditor sees 0
buttons. **Found + fixed an API gap:** History never showed dependant changes (ADR-017 said it would) — `forRecords` now
exposes `subjectId` (the snapshot's `dependantId`, snapshot stays inside), history names the dependant even after removal.
Phone: below `sm` the date moves under the name (the 4-col grid hid Renew 97px off-card at 375). Arabic summary opening
with a digit isolated in `<bdi>` (digit landed at the wrong end of the LTR line). API **701/701**.
**DEP-04 done — My family; the dependants epic (ADR-017, DEP-00..04) is COMPLETE.** `me/family-section.tsx`: own dependants,
read-only, numbers in full, chips; one action "Something wrong? Request a change" → the raise dialog PRESET to General ·
"Family details" (`preset` read through a REF — an inline object as an effect dependency would reset the form on every
keystroke). Verified as employee-a: Yasmin + Omar, 45d iqamas, nothing of a same-company colleague's family; the request
reached staff with General's 1-day due date. No API change.
**MOB-00 done — onboarding + final exit are IN the architecture (ADR-018, v1.12).** GRO owns SEQUENCES (`gro_sequences` +
`gro_sequence_steps`) of the prototype's FIXED step lists (onboarding 11: block visa → salary account/WPS; final exit 8: notice
→ departure + iqama cancelled); step ready / blocked ("Waiting on…") / filed; reopen only while no filed step depends on it.
Owner: the Hiring column becomes real (candidate stage `mobilisation` creates the employee as NEW employment status
`onboarding` — NOT under management — and starts onboarding; completion → `active` + candidate `hired`; Saudi nationals skip
it; withdraw/reject mid-mobilisation cancels + terminates) · fees SHOWN only (Billing records) · final exit's last step
TERMINATES · staff only (`gro.process` files, Auditor reads; `scopeOf` keeps client managers out). Events: CandidateMobilising
→ EmployeeMobilising → OnboardingCompleted. Not in queue/calendar yet. Build MOB-01..05; MOB-04 must handle ~20 status readers.
**MOB-01 done — sequence tables, engine, service.** `gro_sequences` + `gro_sequence_steps` (staff-owned: app_staff SELECT/INSERT/
UPDATE, NO DELETE; app_client/app_employee nothing; PARTIAL UNIQUE index = one running run per employee per kind; step rows
made at start, reopen CLEARS filed_on/by). Pure `gro/domain/sequence-engine.ts` (filed/ready/blocked, targets, filedDependents,
`integrityProblems` — needs must name an EARLIER step) over `sequence-definitions.ts` (the prototype's runbooks verbatim).
`SequencesService` start/file/reopen/cancel, audited `gro-sequence` against the employee; a COMPLETED FINAL EXIT can't be
reopened (owner-approved), a completed onboarding can. 8 red proofs. API **715/715**.
**MOB-02 done — the sequences API.** `GET/POST /employees/:id/sequences`, `POST /gro-sequences/:id/steps/:key/file|reopen`,
`POST /gro-sequences/:id/cancel` (`gro.read` / `gro.process`). CLIENT MANAGERS HOLD gro.read, so every route asks `scopeOf`
for the staff path — proven with a REAL client manager (skip the check → their read returns 200). Contracts `sequence.ts`:
strict bodies, whitelisted responses, steps + `waitingOn` as KEYS (web translates), people as names. API **722/722**.
**MOB-03 done — the Person record's Mobilisation tab.** `mobilisation-tab.tsx` (the prototype's: empty state + Start
onboarding / Start final exit; the running-or-latest run with progress, Next, per-step target Greg+Hijri, fee shown, Mark
filed (date ≤ today) / Blocked / Reopen; Cancel; Earlier sequences). Reopen-with-filed-dependents is explained CLIENT-side
from each step's new `needs` (0 requests; the server stays the guard). API: History now carries `gro-sequence` entries
(`forRecords` rows expose `sequence {kind, step}` from the snapshot, which stays inside) — the same gap DEP-03 had, named in
the card this time. Arabic lines holding a Latin word («فحص GAMCA الطبي») were scrambled under the LTR layout → isolated
with `<bdi>` inside a span; phone: fee + action share a line (`sm:contents` restores the 88+96px columns). API **723/723**.
**MOB-04a done — employment status `onboarding`, handled everywhere (MOB-04 split, owner-approved; 04b = the Hiring column).**
Own enum migration. `@hr/contracts/headcount` gains **`hasJoined(status)`** (not terminated, not onboarding);
`isUnderManagement` = hasJoined && active company → an arrival is in NO headcount/Saudisation figure but stays on People, the
record and the employer's list. Workforce report + CSV gain an **Onboarding** column. Leave: raise refused, out of the
balances list + carry-over (single lookup still answers). `manualEmploymentStatusSchema` → can't be set by hand (400);
`PATCH /employees/:id` refuses clearing it (409). GRO `EmployeeTerminatedHandler` cancels a terminated person's running
ONBOARDING (a running final exit is left to finish). Live: one person set onboarding → Overview/Reports 35→34, Alpha card
11→10, list still 39. API **728/728**.
**MOB-04b done — the Hiring board's Visa & mobilisation column is real (ADR-018 rev. 1).** Candidate stage `mobilisation`
(own migration) + `rec_candidates.employee_id`. Offer → mobilisation (non-Saudi, nationality required) MINTS the employee id
in Recruitment, then: `CandidateMobilisingEvent` → Employees creates the record `onboarding` → `EmployeeMobilisingEvent` →
GRO starts onboarding → on completion GRO CALLS Employees directly (`active`, hire date = the `travel` step's date if none)
→ `EmployeeJoinedEvent` → Recruitment (subscribed BY NAME) moves the candidate to `hired` with no second employee. Withdraw/
reject → `CandidateMobilisationEndedEvent` → Employees terminates → MOB-04a cancels the run. Nobody leaves mobilisation by
hand; a non-Saudi may still be onboarded directly; a COMPLETED sequence is final for BOTH kinds (changes MOB-01). **Rev. 1:**
the ADR's GRO-published completion event would have closed an import loop (gro → employees → recruitment → gro). Board:
`forwardOf(stage, nationality)`, both employee-creating moves ask first, mobilising cards show "N of 11 filed" + Open
onboarding. Live: hire via the board → 36→37 in post on the last step. API **738/738**.
**MOB-05 done — the onboarding / final-exit epic (ADR-018, MOB-00..05) is COMPLETE.** Filing a final exit's last step
TERMINATES the employee: `SequencesService.afterCompletion` calls `EmployeesService.update(…, 'terminate')` directly (the
onboarding-completion call's twin), and the existing termination event closes any self-service account (test: the same
session's `/me` goes 200 → 401). The Mark-filed dialog warns before that step. **`GET /gro-sequences?status=`** (`gro.read`,
staff only via `scopeOf`, default `running`, 400 on an unknown status): runs + `clientId` + `employee {id, name}`. Shared
**`components/sequences-panel.tsx`** = the prototype's "Mobilisations and exits" panel on the Overview and Reports (loads its
own list, nothing without `gro.read`, rows link to `?tab=mob`, exit bar amber). Each panel LINE is one `<bdi>` run — isolating
only the name cut an Arabic line into left-to-right pieces. Seed: 3 runs in flight (`seedSequences`: two NEW hires in
`onboarding` — Bilal Ahmed, Maria Santos — each with a `mobilisation` candidate, + Kamal Uddin's final exit); employees 39 →
41, headcount still 35; a re-seed replaces the seeded runs. MOB-01's completion test now asserts the termination. API
**740/740**. Follow-up MOB-06 (ready steps in queue/calendar).
**PROF-00 done — the client profile + Nitaqat band are IN the architecture (ADR-019, v1.13).** In the prototype the band is a
STORED client field (picked in Add client), so it rides with the profile: identity (CR 10 digits, city, sector — fixed lists
as keys), band (red…platinum) + REQUIRED checked-on date, registrations (Qiwa/GOSI establishment, VAT), main contact,
signatories (≤10, a list on the row), portals (NAMES only — never credentials), service facts (named officer, tier, response
commitment, term) with NO behaviour. Owner: Administrator edits (`client.update`, matrix unchanged) · client managers read
their own through the portal's company view (follows `flag.client-self-service`) · Red/Yellow **warn, never block** (non-Saudi
hiring moves; Red also work-permit renewal + sponsorship transfer) from one shared rule · money stays with Billing. All fields
optional (existing clients predate them). Owner approved PROF-01..06 IN ADVANCE ("approved for all 6").
**PROF-01 done — the profile's data + API.** Migration `client_profile`: 20 optional columns on `cli_clients` + enums
`NitaqatBand`/`ServiceTier`/`ResponseCommitment`; unique CR; CHECKs (CR 10 digits, VAT 15, band ⇔ checked-on, term order,
signatories a JSON list); city/sector/portals are TEXT keys validated by the contract. `@hr/contracts/client-profile` (zod-free
subpath): the lists, `bandAbove`/`bandBelow` (ladder is WORST FIRST). NO new route — `/clients*` and `/portal/company` carry
it through ONE mapper `clients/domain/client-view.ts` `toClientResponse(row, officers, audience)`; audience `client` nulls
`officerUserId` (officer = name + role via `UsersService.staffIdentities`). Service-side rules: checked-on not in the future
(+1 day slack), term end vs the STORED start on a partial change, officer = `isActiveStaffWith(…, 'gro.process')`, duplicate
CR → 409 from the unique index. Write schemas are STRICT at every level (a portal entry carrying a password is a 400). API
**750/750**.

## Technical landmines (each cost real debugging — do not rediscover)

- RLS policies MUST use `NULLIF(current_setting('app.client_id', true), '')::uuid` — pooled connections leave the GUC as '' not NULL (SPIKE-001).
- QUALIFY the policy table's columns inside an RLS subquery (`req_comments.client_id`, not `client_id`): an unqualified
  name resolves to the SUBQUERY's table first, so `r.client_id = client_id` compares a column with itself and the policy
  is a tautology that passes every row (THREAD-01 — caught only because a fence test wrote onto another company).
- RLS can't compare a row's OLD and NEW values, so a status life cycle that must bind EVERY role (staff included) is a
  `BEFORE UPDATE` trigger; column grants still limit which columns the app roles may touch (THREAD-02).
- `<bdi>` as a FLEX CHILD is blockified, so its `dir=auto` also flips its ALIGNMENT (an Arabic file name sat right-aligned
  in the LTR layout). Wrap it: `<span class="truncate"><bdi>…</bdi></span>`. And never put a user's free text (a file
  name) inside a translated SENTENCE: Unicode isolates (FSI…PDI) in an LTR paragraph split an Arabic sentence into runs
  laid out left to right, so the verb lands at the wrong end — worse than no isolate (THREAD-02).
- Two SIBLINGS keyed the same way (`${id}-${counter}`) whenever their counters agree makes React DROP one of them —
  the request thread rendered empty after a re-mount because its new key equalled the decision trail's. Prefix keys
  by role (`thread-…`, `trail-…`); the console says "Encountered two children with the same key" (THREAD-03).
- A seed that UPSERTS rows back to a seeded status must also reset every column a CHECK ties to that status — the
  seed left `info_returns_to` set and re-seeding failed on any request someone had put in `info_needed`, which would
  have broken Seed UAT the first time it was used (THREAD-03).
- A WITH CHECK red proof can be MASKED by the read policy: an INSERT … RETURNING row the caller can't SELECT fails anyway,
  so loosening the write policy changes nothing for that forgery. Test a forgery the read policy WOULD let back out
  (THREAD-01: a colleague's request labelled with my own employee id).
- A role that INSERTs into `aud_entries` needs `GRANT USAGE ON SEQUENCE aud_entries_id_seq` too —
  without it Postgres fails at `nextval` ("permission denied for sequence") BEFORE RLS runs
  (AUDIT-02 for app_client, SS-05 for app_employee).
- A NEW Nest module's routes may not appear on the running dev API (`nest start --watch`) —
  it answered `Cannot PATCH /employee-accounts/…` (404) until restarted, though it had reloaded
  for edits to existing modules. Restart the api preview after adding a module (SS-06a).
- The e2e suite and a running dev server share one Redis/BullMQ queue: the DEV worker consumes
  jobs the tests enqueue (its log fills with `email → e2e-helper-…`). Harmless locally; don't
  read those lines as app behaviour (SS-06a).
- `prisma migrate dev` refuses to run here ("non-interactive environment"). Generate SQL with
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
  write the migration folder by hand, then `pnpm db:deploy` + `pnpm db:generate` (SS-01).
- To limit WHICH COLUMNS a role may update (not just which rows), use a column-level grant
  (`GRANT UPDATE (col, …)`) — RLS can't see columns. Pair it with a RESTRICTIVE policy for the allowed status moves;
  restrictive policies AND with the permissive scope policy (LEAVE-01).
- Before a module subscribes to ANOTHER module's event class, check the import edges both ways: a handler imports
  the publisher's `public-api`, which pulls in its module file. Existing edges: `employees → recruitment` (hire
  events), `gro → employees`. So Recruitment and Employees can NOT import GRO, and Recruitment can NOT import Employees —
  the loop leaves a module `undefined` at decoration time. Use a direct call down an existing edge (GRO → Employees), or
  subscribe by NAME with a test pinning the name (Recruitment's `EMPLOYEE_JOINED`) (MOB-04b).
- Never choose a data path with `principalType === 'client_rep' ? … : staff` — it fails OPEN
  for every other principal. Use `scopeOf(ctx)` from `src/auth/scope.ts`; a test enforces it (SS-01). The scan
  matches the shape ANYWHERE in API src, display mappings included — map with a table (DS-08).
- Turbo v2 strict env: env vars must be declared in turbo.json `globalEnv` or tasks won't see them (CI broke on this).
- NestJS DI needs VALUE imports; `consistent-type-imports` is off for the API only.
- Prisma 7: URL lives in prisma.config.ts, runtime needs the pg driver adapter, `CHECKPOINT_DISABLE=1` on all db scripts (telemetry hangs). `migrate dev` does NOT reliably regenerate the client here — run `db:generate` explicitly after a migration or the new model's delegate is missing (AUDIT-01).
- pnpm v10: `pnpm deploy` needs `--legacy`; corepack shims live in ~/.local/bin (no sudo on this machine).
- shadcn here is Base UI (`render` prop), NOT Radix (`asChild`); init was run with `--rtl`.
- Physical Tailwind utilities (pl-/pr-/left-…) are lint errors — logical only.
- Prisma rejects a date-only string for a DateTime column (`PrismaClientValidationError` → 500).
  Request schemas must `z.coerce.date()` date fields — never reuse a RESPONSE schema (strings)
  as a write schema (DS-07: govdata expiries).
- Sessions CACHE the role: after any role migration in an environment with real users, end
  all sessions (ROLE-03 — stale sessions fail closed, but users would be locked out mid-work).
- Every new client-scoped table follows the checklist in apps/api/src/modules/README.md and registers in the isolation harness (unregistered endpoints fail CI).
- Local ports: Postgres 5433, Redis 6380, MinIO 9002 (API) / 9003 (console) — non-default because 5432/6379/9000 belong to other local tooling. `docker compose up -d` now includes MinIO; storage e2e (STOR-01) requires it up. StorageService is endpoint-configurable + `forcePathStyle` (MinIO); prod object-store provider is still ADR-006-open. Presigned uploads go browser→object-store DIRECTLY (never through the API); this works on MinIO's default CORS locally — a stricter production object store must have CORS configured for the web origin (DOC-05).
- Tailwind v4 `@theme` only EMITS a utility when the class appears in scanned source — a new token is not a usable class until something references it. Verify with a real consumer, not by injecting a class at runtime.
- Do NOT run `next build` (prod) while the web dev/preview server is running — it clobbers `.next` and the dev server then throws `Cannot find module './NNN.js'`. Stop the dev server first, or verify only via the dev server (AUTH-08).
- The Browser pane SCALES an emulated viewport larger than the pane (e.g. 1280 in a ~600px
  pane), and coordinate clicks then drift — a click aimed at one nav row lands on another.
  Click at a size that fits the pane (375), or verify the handler with `element.click()`;
  for layout sweeps, load each route in a same-origin `<iframe>` sized to the width — each
  frame is its own media-query viewport and nothing is clicked (DS-02).
- `new Date('2026-10-06T10:00')` (a `datetime-local` value) is read in the BROWSER's zone. When a form also names a zone,
  convert with `zonedTimeToUtc(value, zone)` from `@hr/dates` (GCAL-04: 10:00 "Asia/Riyadh" from a UTC+4 browser left as
  06:00Z).
- Chrome throttles `setTimeout` to ~1s in a non-foreground tab, so ANY in-browser timing
  measured through timers is quantised to multiples of 1000ms (UX-05: readings of 999/1000/
  3999/5001/6000 looked like an app bug and were the browser). Foreground the tab, or don't
  claim the number.
- In zsh, never name a loop variable `path` — it is tied to `PATH`, so every later command in
  the loop is "not found" and redirections leave EMPTY files behind (DS-04: two pages at 0 bytes).
- `npx prettier --write` from the repo root does NOT pick up the shared config: each
  package references `packages/config/prettier.config.mjs` and there is no root
  `.prettierrc`, so prettier falls back to defaults and rewrites the file to double
  quotes against `singleQuote: true`. Pass `--config packages/config/prettier.config.mjs`
  (UX-16).
- Editing `apps/web/messages/*.json` while the dev server runs reaches the SERVER render
  but not the CLIENT bundle: the served HTML has the new string, the browser renders a
  fallback, and `MISSING_MESSAGE` appears only in the console — so it looks like a wrong
  translation, not a missing key. Restart the dev server (UX-12).
- The browser-automation harness sends key events that are trusted but INCOMPLETE
  (`code: ""`, `keyCode: 0`), and Chrome's default activation keys off `keyCode` — so
  Enter/Space on a `<button>` fires `keydown` and NO click, and arrow keys do not scroll
  a focused region. Tab works (the focus manager needs no code). Do not read a
  non-activating button as an app bug; confirm activation by mouse (UX-11).
- Base UI's `Dialog` `onOpenChange` fires only for the dialog's OWN gestures (Escape, overlay,
  close button) — never when the parent sets `open`. Resetting a form "on open" inside it never
  runs; track `open` during render instead (DS-09; DS-08's New request had shipped with this).
- HTML drag-and-drop: judge drop legality from a REF set in `dragstart`, not React state (the
  first `dragover` can beat the re-render), and cancel `dragenter` as well as `dragover` — a fast
  drag can release before any `dragover` reaches the target (DS-09, measured with a real mouse).
- `DialogContent` is a CSS grid: its items default to `min-width:auto`, so one truncating
  (`nowrap`) line sets a minimum wider than a phone and the dialog overflows sideways. Give
  the items `min-w-0` (`[&>*]:min-w-0` on DialogContent) when a dialog holds truncated text (DS-13).
- Closing a dialog inside a `<Link>`'s onClick CANCELS the navigation — `next/link` runs
  `startTransition(() => router.push())` and the close unmounts the subtree owning that
  transition. Close on pathname change instead (UX-05).
- Cloud Run domain mappings: `me-central2` refuses even listing, `me-central1` lists but REFUSES creating (501).
  Use a global HTTPS load balancer; never pass `--protocol=HTTPS` to its backend service — gcloud then sets port
  name `https`, which a serverless NEG rejects (GCP-05).
- Hostinger's panel can stop showing a record its nameservers still serve. Verify DNS with `dig +norec` against
  `pixel/byte.dns-parking.com` (compare the SOA serials), not the panel. A managed cert that hit
  `FAILED_NOT_VISIBLE` meanwhile needs REPLACING (new cert → swap on the proxy → delete the old) (GCP-05).
- The repository is PUBLIC: anything in it (the dev seed password included) is public. Never seed an
  internet-facing environment with it — `seed-guard.ts` enforces this (GCP-06).
- `minio/minio` no longer exists on Docker Hub ("repository does not exist") or Quay (401) —
  it only runs where it is cached. CI uses `bitnamilegacy/minio@sha256:451fe68…` (GCP-04).
- Build a Redis connection from the WHOLE `REDIS_URL` — the queue's host+port copy dropped the
  password and the UAT worker got `NOAUTH` while `/api/ready` stayed green (GCP-04).
- GitHub's anonymous API is 60 requests/hour; a CI watcher polling 3 endpoints every 45s runs dry
  mid-run. Watch deploys from the Google side (gcloud) and poll GitHub rarely (GCP-04).
- e2e apps MUST `await app.listen(0, '127.0.0.1')`, never `app.init()` — supertest otherwise re-binds per
  request on the IPv6 wildcard and can be answered by ANOTHER program holding that port on 127.0.0.1
  (HARNESS-01: an SSH banner came back as an HTTP response). A scan spec enforces it.
- BullMQ (NOTIF-01): the connection needs `maxRetriesPerRequest: null`. A Worker holds a blocking Redis connection whose teardown emits a benign "Connection is closed" unhandled rejection in EVERY app-creating spec → suite exit 1. Fix in place: producer (`QueueModule` in `AppModule`) is split from the worker (`DispatchWorkerModule`), which runs only in `MainModule` (main.ts) + the queue e2e. Keep workers out of `AppModule`. Producer queues closed mid-connect ALSO crashed (HARNESS-01) — `QueueShutdownGuard` covers it; keep it.

## Commands

pnpm install · pnpm turbo run lint typecheck test build ·
pnpm --filter @hr/api db:migrate|db:deploy|db:seed ·
docker compose up -d (local PG+Redis)
