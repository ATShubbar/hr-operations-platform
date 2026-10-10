# MOB-04a — The `onboarding` employment status, handled everywhere — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-018. The owner approved splitting MOB-04 in two: this card makes the status safe; MOB-04b turns on the Hiring column.
- Nobody becomes `onboarding` through the product until MOB-04b.

## What changed

| Area | Change |
|---|---|
| Database | `EmploymentStatus` gains `onboarding`, on its **own migration** (`20261010120000_employment_status_onboarding`; Postgres won't use a new enum value in the adding transaction). |
| Contracts | `employmentStatusSchema` includes `onboarding`. New **`manualEmploymentStatusSchema`** (active / on_leave / suspended / terminated), used by the create and update write schemas, so `onboarding` can't be set by hand (400). **`hasJoined(status)`** in `@hr/contracts/headcount`: in post, neither left nor still on the way in. `isUnderManagement` is now `hasJoined && company active`. |
| Headcount | The Workforce report, the Overview, the Reports dashboard and client figures all use the shared rule, so an onboarding person is **not counted** in headcount or Saudisation. Two hand-written "not terminated" counts (`client-figures.ts` `figuresFor`, `client-overview.tsx`) now call `hasJoined`. |
| Workforce report | New **Onboarding** column (and the CSV header), so they're visible without being counted. |
| Leave | `raiseRefusal` refuses `onboarding` ("…has not started yet"). The balances list and the 1 January carry-over use `hasJoined`. A single balance lookup still answers, so the Person record's Leave tab loads, with no Request leave button. |
| Hand edits | `PATCH /employees/:id` refuses to change the status of someone who is `onboarding` (**409**). Their other fields stay editable. |
| Termination | New GRO `EmployeeTerminatedHandler`: a terminated person's running **onboarding** is cancelled, audited as `cancel` with `reason: 'terminated'`. A running **final exit** is left alone, because the departure paperwork is still to be done. |
| Web | Label "Onboarding" / «قيد الاستقدام» (`EMPLOYMENT_STATUS_KEY`); tone `info`. Not offered in the Profile tab's status choices; while someone is onboarding, the status shows as text with "Follows the onboarding sequence — it becomes Active when the sequence completes." `reports.column.onboarding` added. |
| Self-service | Unchanged, as the card said: an onboarding person can be invited and can see their file. |

## Every reader of employment status, and what it does now

| Reader | With `onboarding` |
|---|---|
| `reporting.service` workforce (rule + status columns) | not in headcount; own column |
| `reporting.service` payroll cost (`=== 'active'`) | excluded (unchanged code) |
| `leave.service` × 3 → `raiseRefusal` | refused |
| `leave-balance.service` list, `leave-carry-over.service` | excluded (`hasJoined`) |
| `self-service.controller`, `employee-accounts.service` (terminated checks) | unchanged: allowed |
| `employees.controller` create / update / terminate | can't be set (400) or cleared (409) by hand; terminate works |
| `employees.service` (termination event), `employee-view` (2 mappers) | unchanged: pass the value through |
| `candidate-hired.handler` (creates `active`) | unchanged until MOB-04b |
| web `client-figures` (`underManagement`, `figuresFor`), `client-overview` | not counted |
| web `clients/[id]/page` staff list (People tab, procedure picker) | **shown** (on file) |
| web Person record header / Profile tab / Leave tab; portal employees list | label shown; status read-only; no Request leave |

## Tests

- **`packages/contracts` headcount test**: the rule over every employment × client status; the status list is pinned (a new status fails until decided); `hasJoined`; the manual list excludes `onboarding`. Red before the change, then 11/11.
- **`test/employment-onboarding.e2e-spec.ts`**, 5/5:
  - Workforce row is `headcount 2, active 2, onboarding 1, saudi 1, nonSaudi 1, saudizationPct 50` for two in post + one arriving.
  - They are still on the staff list and their record, with the status.
  - Leave raise gives 400. They are absent from the balances list (which holds the two in post). Carry-over touches exactly 2 people and writes no ledger row for them.
  - Create with `onboarding` gives 400; edit to `onboarding` gives 400; edit away from it gives **409** (twice). Other fields give 200, and the status stays.
  - Terminating cancels the running onboarding (audited), and the other person's running final exit stays `running`.
- **`reports-export`**: the pinned Workforce CSV header gained `Onboarding`. This was the one existing test the change broke, consistently; it was updated deliberately.

**Red proofs** (each broken, its test fails, then restored byte-identical):

| Broken | Failed |
|---|---|
| Report counts anyone not terminated | headcount test |
| Leave rule no longer refuses `onboarding` | leave test |
| Balances list filters "not terminated" only | leave test |
| Carry-over filters "not terminated" only | leave test |
| Hand-edit guard removed | hand-edit test |
| Termination handler not registered | termination test |

**Full API suite 728/728, twice.** Contracts 11/11. API and web `typecheck` + `lint` are clean. **`next build` succeeds** (dev server stopped).

## Live (Administrator, temporary TOTP cleared after; one seed person set to `onboarding` by SQL, then restored)

| Figure | Before | Syed Ali `onboarding` |
|---|---|---|
| Overview → Headcount under management | 35 | **34** |
| Reports → Headcount | 35 · 51% | **34** · 53% |
| Clients → Alpha card: headcount / Saudi share | 11 / 55% | **10** / 60% |
| Workforce report: Alpha row | headcount 11, onboarding 0 | headcount **10**, **onboarding 1** |
| `GET /employees` | 39 | **39**: still listed, `employmentStatus: onboarding` |

- **His record:**
  - Header label "Onboarding".
  - Profile → Employment → Edit: contract type and the others are selectors, but Employment status is plain text with the "Follows the onboarding sequence…" note and **no selector**.
  - Leave tab loads with **no Request leave**.
- **`/ar/…` at 375:** «قيد الاستقدام» in the header and the field; 0px overflow.
- **Restored:** Syed Ali is back to `active`, 0 people are `onboarding`, and 0 seed accounts are MFA-enrolled.

## Notes

- A running final exit surviving a manual termination is deliberate. MOB-05 makes the exit's own last step do the terminating, so the two won't normally meet.
- Environment: Colima had stopped; the local containers were started again before testing. No data was lost.
