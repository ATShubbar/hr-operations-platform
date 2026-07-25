# REP-01 — Reporting module + report catalog + read models — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → REP-01 (ACTION-PLAN 5.4, architecture module 11)
- Status: done
- Commit: `REP-01: reporting module — permission-declaring report catalog + six read models`

## What shipped

The foundation of the last product epic. Read models only — no HTTP surface
(REP-02), no permissions granted yet (the catalog convention is that a permission
lands in the same commit as its endpoint).

- **`modules/reporting`** — a delivery-layer module that owns no tables and reads
  every domain module below it through its `public-api` (Clients, Employees,
  Documents, Recruitment, GRO, Requests, Tasks). Nothing imports Reporting, so it
  is a leaf at the top of the graph — no cycle.
- **The report catalog** (`domain/report-catalog.ts`) — six typed definitions,
  each declaring the permissions required to run it. This is the epic's
  authorization idea: **a report is readable exactly when its underlying data
  is**, so the architecture's Reports matrix row ("Recruiter R (recruitment) · GRO
  Officer R (GRO) · Finance R (financial)") falls out of the existing permission
  catalog instead of needing a second, parallel model.

  | Report | Category | Requires | Who that excludes |
  |---|---|---|---|
  | `workforce` | workforce | `employee.read`, `client.read` | — (all staff) |
  | `compliance-expiry` | compliance | `employee.read`, `govdata.read`, `document.read` | Recruiter, Finance |
  | `recruitment-pipeline` | recruitment | `vacancy.read`, `candidate.read` | GRO Officer, Finance |
  | `gro-workload` | gro | `gro.read` | Recruiter, Finance |
  | `service-operations` | operations | `request.read`, `task.read` | — (all staff) |
  | `payroll-cost` | financial | `employee.read`, `salary.read` | Recruiter, GRO, Read-Only |

- **One generic result shape** (`domain/report-result.ts`) — columns + rows +
  summary, not six bespoke payloads, because both consumers are generic: CSV
  export (REP-03) is a fold over columns × rows, and the web table (REP-04)
  renders any report without per-report code. `column.key` doubles as the web
  i18n key; `column.label` is the plain-English CSV header.
- **`ReportingService`** — the six producers, composed from the owning modules'
  services (module rule 3: no module touches another's tables). Deliberately
  **permission-agnostic**: it computes; REP-02 gates. `run(id, now)` takes an
  injectable clock so bucket/overdue arithmetic is deterministic.
- **Shared metric helpers** (`domain/report-metrics.ts`) — UTC-anchored
  `daysUntil` (the CAL-03 month-boundary lesson), the 90-day expiry buckets
  (`expired`/`due30`/`due60`/`due90`, mutually exclusive so a row's buckets sum
  to its total), `isPastDue`, and Decimal→number.

## Architectural decision recorded: no materialized views in v1

The architecture permits "transactional queries + materialized views on the
primary". A materialized view spanning several modules' tables would put a shared
DB object astride their schemas and break **own your data** (module rule 3) — so
v1 composes the owning modules' services, exactly as Calendar does. If a report
is ever provably slow, the MV belongs to the module whose data it aggregates, not
to Reporting. Not a deviation from the frozen contract; a not-yet-needed option,
recorded here so it is a decision rather than drift.

## Tests — `test/reporting-service.e2e-spec.ts` (8 tests)

Method: a dedicated fixture client (3 employees, 1 vacancy + 3 candidates, 2 GRO
processes, 2 requests, 3 tasks, 1 document). Per-client reports are asserted
**absolutely** on the fixture row; globally-shaped reports (compliance kinds, GRO
types) are asserted as **deltas** against a baseline run taken before the fixtures
exist — so the spec is correct regardless of what else is in the dev database.

| Test | Proves |
|---|---|
| catalog | 6 definitions; every `requiredPermissions` entry exists in `PERMISSIONS` (no report may invent one); `payroll-cost` requires `salary.read`; `gro-workload` requires `gro.read`; `isReportId` |
| run-all | every report returns a well-formed table; **every row fills every declared column** (the export/UI contract) |
| workforce | headcount 3 · active 2 · terminated 1 · Saudi 1 · Saudization 33.33% |
| compliance-expiry | iqama → `expired`, passport → `due30`, work permit → `due60`, exit/re-entry → `due90`, document → `due30`; summary +5 |
| recruitment-pipeline | per-vacancy stage counts (applied 1 / interview 1 / hired 1, total 3) |
| gro-workload | counts by type; **only ACTIVE past-due processes are overdue** — both fixtures are past due, the `completed` one is terminal, so overdue = 1 (terminal set matches CAL-02) |
| service-operations | requests beside tasks per client, overdue + unassigned; a task with **no client** lands in its own `(no client)` row |
| payroll-cost | active-only costing (the terminated employee's 20 000 excluded); basic 18 000 + allowances 4 500 = 22 500; avg 11 250 |

### One real finding while verifying

The first full-suite run failed in `expiry-schedule.e2e-spec.ts`, which was green
on a clean tree (verified by stashing: 312/312). Cause: the fixture document
originally expired 16 days out, i.e. **inside the document-expiry engine's 60-day
scan horizon**, so a concurrently-running global scan claimed it. Fix: the whole
fixture is anchored a year out (`NOW = 2027-06-01`), outside any scan window.
Checked afterwards for residue — `exp_alerts` orphans: 0; leftover fixture
clients/tasks/documents: 0.

## Commands

```
pnpm --filter @hr/api exec vitest run test/reporting-service.e2e-spec.ts   # 8 passed
pnpm --filter @hr/api test        # 320 passed (61 files) — was 312
pnpm turbo run lint typecheck build   # 12 tasks successful
```

The suite's known benign BullMQ teardown noise ("Connection is closed" from
ioredis in `health.e2e-spec`) still flakes the process exit code on some runs; it
occurs on a clean tree too and no test fails with it.

## Files

- `apps/api/src/modules/reporting/reporting.module.ts` (NEW)
- `apps/api/src/modules/reporting/public-api.ts` (NEW)
- `apps/api/src/modules/reporting/domain/report-catalog.ts` (NEW)
- `apps/api/src/modules/reporting/domain/report-result.ts` (NEW)
- `apps/api/src/modules/reporting/domain/report-metrics.ts` (NEW)
- `apps/api/src/modules/reporting/application/reporting.service.ts` (NEW)
- `apps/api/src/app.module.ts` (register `ReportingModule`)
- `apps/api/test/reporting-service.e2e-spec.ts` (NEW)

## Next

REP-02 — the HTTP API: `GET /reports` filtered to what the caller can actually
run, `GET /reports/:id` enforcing that report's `requiredPermissions`, and the
`report.read` grants per the matrix.
