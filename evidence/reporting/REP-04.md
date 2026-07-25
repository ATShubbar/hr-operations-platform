# REP-04 — Reports web UI (catalog · generic table · export) — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → REP-04 (ACTION-PLAN 5.4)
- Status: done — **closes the Reporting epic (5.4)**
- Commit: `REP-04: reports web UI — permission-filtered catalog, one generic table, CSV export`

## What shipped

The staff console over the REP-02/03 API, and the payoff of the shared table shape:
**one table component renders all six reports** — a seventh report needs no
front-end change beyond its labels.

- **`(app)/reports/page.tsx`** — the catalog as a row of report buttons, then the
  selected report's summary tiles and its table. The catalog arrives **already
  filtered by the API**, so the page never reasons about permissions to decide
  what to offer; it renders what it is given. The only client-side check is
  cosmetic: hiding a download button that would 403 (`report.export`).
- **Export** — fetched as a blob (not through `apiFetch`, which parses JSON) so
  the CSV bytes reach the browser untouched, then downloaded as
  `<report-id>-<date>.csv`.
- **Bilingual** — column headers and cell values arrive as stable keys and are
  translated through `reports.column.*` / `reports.value.*`, **falling back to the
  API's English label** when a key is missing, so a new report degrades to English
  instead of crashing. Numbers are locale-formatted; the run timestamp uses the
  dual Hijri/Gregorian renderer.
- **Nav** — a "Reports" link gated on `report.read`.

### One API change, made here on purpose

`compliance-expiry` previously put English prose in its `item` cells (`"Work
permit"`). It now emits stable keys (`workPermit`), matching `gro-workload` and
`recruitment-pipeline`, which already emit raw enum values — so the web can
translate them and the report is internally consistent. Column *labels* remain
plain English for the CSV. `test/reporting-service.e2e-spec.ts` updated.

## Browser verification (live, API :3001 / web :57636)

| DoD item | Result |
|---|---|
| Nav link + page for a `report.read` holder | ✅ (hr_officer) |
| **Catalog matches the caller's permissions** | ✅ hr_officer 6 reports · **read_only 5** (no payroll-cost) · **finance 3** (workforce, service-operations, payroll-cost) |
| **Export button hidden without `report.export`** | ✅ read_only holds `report.read` only → no Export button in the DOM |
| Generic table renders every report | ✅ workforce, compliance-expiry, payroll-cost all rendered from the same component |
| Summary tiles + dual-calendar timestamp | ✅ "Generated Safar 11, 1448 AH · July 25, 2026" |
| **Bucketing is real, not a zero table** | ✅ temporarily moved one seeded employee's iqama expiry to +10 days → the Iqama row moved to `Due ≤30d` = 1, summary total 1 (**restored afterwards**) |
| CSV download works from the button | ✅ click produced an audit row; `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="compliance-expiry-2026-07-25.csv"` |
| **BOM survives the wire** | ✅ first bytes `EF BB BF` then `Ite…` (`fetch().text()` strips the BOM per spec — checked the raw `arrayBuffer`) |
| Export is audited | ✅ `aud_entries`: `hr_officer · report · export · {rows:5, format:"csv", columns:6, reportId:"compliance-expiry"}` — no payload |
| Both locales | ✅ en (LTR) + **ar RTL**: sidebar right, table columns right-to-left, Arabic headers (العميل / إجمالي الأساسي / الإجمالي الشهري), export button mirrored, payroll totals 24,500 monthly → 294,000 annual |
| No console errors | ✅ none |

Cleanup afterwards: the employee's expiry restored to `2026-11-01`, all
`resource='report'` audit rows deleted (verified 0), both dev servers stopped
(the `--watch` API server drains shared Redis — NOTIF-05 landmine).

## A pre-existing test flake, found and diagnosed (not fixed here)

While running the suite I hit an intermittent failure (~1 run in 3) in
`test/isolation/isolation.e2e-spec.ts` — an **unauthenticated** `GET /documents`
answering **200**, and on another run `expected 401, got 404`, plus an earlier
`Parse Error: Expected HTTP/` in `expiry-schedule`. Those symptoms deserved
certainty, so I chased them:

- **The application is not leaking sessions.** 200 sequential unauthenticated
  `GET /documents` requests against one app instance returned 401 every time.
  `requestContext` is a correct `AsyncLocalStorage`, and `PermissionsGuard` 401s
  whenever `ctx.actorId` is absent.
- **~20 concurrent supertest requests reliably produce `read ECONNRESET`** —
  never a wrong status. `supertest(app.getHttpServer())` opens and closes an
  ephemeral-port listener per call; with 63 worker processes doing that hundreds
  of times, a request can be answered by a different app instance. That single
  cause explains all three symptoms (a 200 from an authenticated spec, a 404 from
  an app with different routes, an HTTP parse error).

Kept from the investigation: the isolation harness's staff loop now collects
**every** offending route instead of stopping at the first — that change is what
made the failure identifiable (`GET /documents -> 200`) rather than anonymous.
The harness fix itself is out of scope for this card and is filed as a follow-up
task.

## Commands

```
pnpm --filter @hr/web typecheck && pnpm --filter @hr/web lint   # clean
pnpm --filter @hr/api test        # 336 passed (63 files) — 4 of 6 runs clean; see the flake above
pnpm turbo run lint typecheck build   # 12 tasks successful
```

## Files

- `apps/web/src/app/[locale]/(app)/reports/page.tsx` (NEW)
- `apps/web/src/components/app-shell.tsx` (Reports nav, `report.read`-gated)
- `apps/web/messages/{en,ar}.json` (`nav.reports` + a full `reports.*` block: reports, categories, ~58 column labels, value translations)
- `apps/api/src/modules/reporting/application/reporting.service.ts` (compliance `item` cells → stable keys)
- `apps/api/test/reporting-service.e2e-spec.ts`, `apps/api/test/isolation/isolation.e2e-spec.ts` (offender-listing diagnostic)

## Epic status

**Reporting epic (5.4) COMPLETE — REP-01..04**: the permission-declaring report
catalog + six read models, the filtered/gated HTTP API, the audited CSV export,
and the console. **Seventeen product screens.** This closes the last product epic
in the plan — Priorities 2–5 are done. Deferred by decision: materialized views
(REP-01), and Client Admin's "own summary" portal report (matrix), which was left
un-built rather than guessed at.
