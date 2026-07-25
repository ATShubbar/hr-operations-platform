# REP-03 — CSV export, gated by `report.export` and audited — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → REP-03 (ACTION-PLAN 5.4)
- Status: done
- Commit: `REP-03: report CSV export — a distinct export capability, and the first audited read`

## What shipped

`GET /reports/:id/export?format=csv` — the download surface, and with it a
pattern the platform did not have: **an audited READ**.

- **Export is a distinct capability.** A new `report.export` permission, granted
  to every staff role that reads reports **except Read Only** — whose whole
  identity is passive access, and for whom bulk extraction is a different act.
  The report's own `requiredPermissions` still apply on top, so a Recruiter
  (who holds `report.export`) still cannot export `payroll-cost`.
- **The first audited read** (`resource: 'report'`, `action: 'export'`). Reading
  a screen is not an audit event; pulling a client's whole payroll into a
  spreadsheet is — it is the moment data leaves the platform's authorization
  boundary. The audit is written **before** the bytes are returned, so a failed
  audit fails the export: an extraction can never leave unrecorded.
- **The entry records the ACT, never the payload** — `{reportId, format, rows,
  columns, generatedAt}`. Copying the exported rows into `aud_entries` would
  duplicate the very salary/government data the report gates into a table with
  different access rules. The audit answers *who extracted what, when* — not
  *what did it say*. Asserted by exact key-set equality in the spec.
- **One CSV renderer for all six reports** (`domain/report-csv.ts`) — a fold over
  columns × rows, which is precisely why REP-01 chose a single table shape.
  RFC 4180 (CRLF, quote-only-when-needed, doubled inner quotes), a **UTF-8 BOM**
  so Excel opens Arabic client names as Arabic rather than mojibake, and the
  summary appended after a blank line so the totals travel with the table.
- `format` is validated (`csv` only in v1 → 400 otherwise), and the filename is
  `<report-id>-<YYYY-MM-DD>.csv` so a folder of exports sorts sensibly.

### Harness: a new `AUDITED_READS` registry

The AUDIT-03 write registry is scoped to mutations, so a GET declared there would
have been flagged stale. Rather than leave the first audited read invisible to
CI, `test/audit/audited-writes.ts` gains an **`AUDITED_READS`** allow-list and the
coverage spec asserts each entry is still a live GET route. Deliberately an
allow-list, not a coverage requirement — auditing reads *by default* would
produce a log, not an audit trail.

## Tests — `test/reports-export.e2e-spec.ts` (6 tests)

| Test | Proves |
|---|---|
| headers + encoding | `text/csv`, `Content-Disposition: attachment; filename="workforce-YYYY-MM-DD.csv"`, UTF-8 BOM, exact header row, **`Al-Rajhi, "Trading" Co` → `"Al-Rajhi, ""Trading"" Co"`** (a fixture client named to break naive CSV), `Summary,Value` block present |
| CSV ≡ JSON | the export's data-row count and column count match the same report's JSON run |
| **audit** | one export → exactly one `report.export` entry (found by actor, not position); actor + role recorded; `after` key set is exactly `{columns, format, generatedAt, reportId, rows}` — **no exported values** |
| **Read Only** | reads `workforce` (200) but export → **403**, and the refused export writes **no** audit row |
| data gate + format | Recruiter (holds `report.export`) → `payroll-cost` export **403**; unknown id → 404; `?format=pdf` → 400; `?format=csv` → 200 |
| unauth | 401 |

Registered: `GET /reports/:id/export` in the isolation registry (`staff`) and in
`AUDITED_READS` as `report.export`.

### One bug caught in my own spec

The first full-suite run failed on the audit assertion: the spec picked the audit
row by array position, but `findMany` has no inherent ordering, so it sometimes
picked the `hr_officer` export from an earlier test in the same file. Fixed to
select by `actorId`. The production code was never wrong — the assertion was.

## Commands

```
pnpm --filter @hr/api exec vitest run test/reports-export.e2e-spec.ts test/audit/write-coverage.e2e-spec.ts   # 10 passed
pnpm --filter @hr/api test        # 336 passed (63 files) — was 329
pnpm turbo run lint typecheck build   # 12 tasks successful
```

Dev-DB residue check after the runs: `aud_entries` with `resource='report'` → 0;
leftover fixture clients → 0. The 3 unhandled errors in the run are all the
documented benign `Connection is closed.` BullMQ teardown noise.

## Files

- `apps/api/src/modules/reporting/domain/report-csv.ts` (NEW)
- `apps/api/src/modules/reporting/application/reporting.service.ts` (`recordExport`)
- `apps/api/src/modules/reporting/api/reports.controller.ts` (export route + `entitledReport` helper)
- `apps/api/src/modules/reporting/reporting.module.ts` (+AuditModule)
- `apps/api/src/modules/auth/domain/permissions.ts` (`report.export` + 6 role grants)
- `apps/api/test/isolation/endpoint-registry.ts`, `apps/api/test/audit/audited-writes.ts` (`AUDITED_READS`), `apps/api/test/audit/write-coverage.e2e-spec.ts`
- `apps/api/test/reports-export.e2e-spec.ts` (NEW)

## Next

REP-04 — the reports web UI: the permission-filtered catalog, a generic table for
any report, and a download button (visible only to `report.export` holders).
Closes the epic.
