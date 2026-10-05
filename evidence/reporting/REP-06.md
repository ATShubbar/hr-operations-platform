# REP-06 — The Workforce report counts people the way the dashboards do — Evidence

- Date: 2026-10-05
- Card: `BACKLOG.md` → REP-06 (found in DS-16). Status: **done**.

## Owner decision

| Question | Answer |
|---|---|
| Archived client companies in the Workforce report? | **Left out** (recommended): active companies only, like the dashboards. Their people stay on file and on People. |

## The mismatch

- Workforce report (REP-01): headcount = **every employee on file** (leavers included), across **every client** (archived included), with Saudization % on that base.
- Overview + Reports dashboard (DS-17, owner decision): "under management" = **not terminated, at an ACTIVE client**.

The seed showed **39** in the report against **35** on the dashboards.

## What was built

| Piece | What |
|---|---|
| `packages/contracts/src/headcount.ts` | `isUnderManagement(employmentStatus, clientStatus)`: not `terminated` AND client `active`. **Zod-free**, on its own subpath `@hr/contracts/headcount`, like CAL-04's `work-status`; also re-exported from the root for the API. |
| Workforce report | Rows for **active companies only**. Per company, the status columns (Active / On leave / Suspended / Terminated) still count everyone at the company, so **leavers stay visible as Terminated**. **Headcount, Saudi / Non-Saudi and Saudization % count only the people under management.** The summary's clients / headcount / active / saudi / % follow the same rule. The CSV export follows automatically (same table). |
| Web | `clients/client-figures.ts` `underManagement()` now calls `isUnderManagement`, so the dashboards and the report share one function. |

## Tests

- **`headcount.test.ts`: 2/2.** Every employment status × every client status is decided against the rule, and the status lists are pinned (a new status fails until someone decides it).
- **`report-workforce.e2e-spec.ts`: 3/3.** Fixture: an active company with an active Saudi, an on-leave Indian and a terminated Saudi, plus an archived company with two active people.
  - The company row is `{headcount 2, active 1, onLeave 1, terminated 1, saudi 1, nonSaudi 1, saudizationPct 50}`.
  - **The archived company has no row.**
  - **The report's totals equal the dashboards' rule applied to the whole database** (headcount, Saudi count, active-company count).
- **REP-01's workforce test corrected on purpose.** It pinned the old definition (headcount 3 with the leaver, 33.33%). Under the new rule it reads headcount 2, terminated 1 (still shown), Saudi 1, non-Saudi 1, **50%**.

**Red proofs** (each removed, its tests went red, restored, byte-identical):

| Removed | Tests that went red |
|---|---|
| leavers counted in the headcount again | the company-row test, the totals test, REP-01's |
| archived companies included again | the archived test, the totals test |
| the shared rule ignores the company's status | the unit test, **and** the report-vs-dashboard totals test, so the cross-check catches a drift between the two sides |

**Full API suite: 668/668** (665 + 3). `@hr/contracts` 9/9; `@hr/api` and `@hr/web` lint + typecheck green.

## Live (local) — Administrator, Reports page

The seed Administrator was enrolled with a temporary authenticator for this check and cleared by SQL afterwards (0 enrolled).

- **Dashboard tiles:** Clients **4** under management · Headcount **35** · 18 Saudi · 51% overall.
- **Workforce report** (same page, `GET /reports/workforce`): summary `{clients: 4, headcount: 35, saudi: 18, saudizationPct: 51.43}`.
  - Rows: Alpha Trading Co. 11 (+1 terminated), Beta Contracting Est. 9, Najd Logistics Co. 8, Gulf Medical Group 7.
  - The archived company has no row.
  - **The two now agree.** The report said 39 before.
