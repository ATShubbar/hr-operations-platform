# REP-02 — Reports HTTP API (permission-filtered catalog + run) — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → REP-02 (ACTION-PLAN 5.4)
- Status: done
- Commit: `REP-02: reports API — permission-filtered catalog + gated report runs`

## What shipped

The staff-only, read-only HTTP surface over the REP-01 read models.

| Route | Permission | Behaviour |
|---|---|---|
| `GET /reports` | `report.read` | the catalog **filtered** to the reports the caller may actually run |
| `GET /reports/:id` | `report.read` + the report's own `requiredPermissions` | runs the report → `{id, generatedAt, columns, rows, summary}` |

**Two gates, deliberately.** `report.read` (matrix: every staff role, so it went
into `STAFF_BASE`) admits a caller to the reporting surface at all. Each report's
declared `requiredPermissions` then decides which reports they may list and run —
**ALL of them must be held** (AND), so a report joining two sensitivity groups is
readable only by someone who may read both. That second check is what makes the
matrix's parentheticals real: a Recruiter holds `report.read` but not
`salary.read`, so `payroll-cost` is neither listed for them nor runnable, and no
salary figure is reachable through this route.

The catalog is **filtered, not annotated-and-hidden** — what a caller can see is
exactly what they can run.

### Two decisions worth naming

- **Unknown id → 404, un-runnable id → 403.** The catalog is static and
  documented, so a report's existence is not a secret; a 403 that names the
  missing permission (`Report requires: employee.read, salary.read`) tells an
  operator why, where a 404 would send them hunting a deployment problem.
- **No client path.** The matrix's "Client Admin R (own summary)" is a portal
  surface, not this route, so `report.read` is staff-only and client roles get
  403. Whether that summary ships is the REP-05 decision at epic close.

## Tests — `test/reports-api.e2e-spec.ts` (9 tests)

| Test | Proves |
|---|---|
| contract drift | the contract's `reportIdSchema` enum equals the API's `REPORT_IDS` |
| HR Officer | holds every underlying permission → sees all six; descriptor exposes `requiredPermissions` + category so the UI can explain a gate |
| **Recruiter** | catalog = recruitment-pipeline · service-operations · workforce (no GRO, **no payroll**, no compliance) |
| **Finance** | catalog = payroll-cost · service-operations · workforce (no recruitment, no GRO) |
| **GRO Officer** | catalog = compliance-expiry · gro-workload · service-operations · workforce (no payroll) |
| run | Finance runs `payroll-cost` → validates against `reportResultResponseSchema`; `monthlyTotal` column + `annualTotal` summary present |
| **403** | Recruiter → `payroll-cost` 403 **naming `salary.read`**; `gro-workload` 403; `recruitment-pipeline` still 200 |
| 404 | unknown report id |
| clients / unauth | client rep → 403 on both routes; unauthenticated → 401 on both |

Harness: both routes registered in `test/isolation/endpoint-registry.ts` as
`staff` (the coverage spec diffs the registry against the live route map in both
directions). No entries in `audited-writes.ts` — both routes are reads. Auditing
the **export** is REP-03's job.

## Commands

```
pnpm --filter @hr/api exec vitest run test/reports-api.e2e-spec.ts   # 9 passed
pnpm --filter @hr/api test        # 329 passed (62 files) — was 320
pnpm turbo run lint typecheck build   # 12 tasks successful
```

The 3 unhandled errors reported by the run are all the documented benign
`Connection is closed.` ioredis/BullMQ teardown noise (verified: `grep` of the
run shows nothing else); no test fails with them.

## Files

- `packages/contracts/src/report.ts` (NEW) + `index.ts` export
- `apps/api/src/modules/reporting/api/reports.controller.ts` (NEW)
- `apps/api/src/modules/reporting/reporting.module.ts` (+AuthModule, controller)
- `apps/api/src/modules/auth/domain/permissions.ts` (`report.read` + STAFF_BASE grant)
- `apps/api/test/isolation/endpoint-registry.ts` (2 staff routes)
- `apps/api/test/reports-api.e2e-spec.ts` (NEW)

## Next

REP-03 — CSV export gated by `report.export`, and **audited**: a bulk export of
HR data is a privacy event, which makes it the first audited READ in the system.
