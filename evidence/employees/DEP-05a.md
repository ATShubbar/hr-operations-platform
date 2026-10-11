# DEP-05a — Dependants in the expiry runway and the expiring figures — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for both"). Owner decisions: the "expiring in 30 days" figures count dependants **everywhere** · runway cells will open the sponsors on People (DEP-05b). ADR-017 rev. 1.

## What was built

**API.** `GET /dependants/expiries` (optional `?clientId=`): every current dependant's iqama, passport and insurance expiry, with the sponsor's id.

| Rule | Value |
|---|---|
| Who | Staff who can read employees (`employee.read`); the Auditor too |
| Refused | Client managers, employees, the unauthenticated |
| Carries | Sponsor id + three dates. No name, no birth date, no iqama number, no dependant id |
| Removed dependants | Never included |
| New permission | None |

Files: `packages/contracts/src/dependant.ts`; `apps/api/src/modules/employees/api/dependant-expiries.controller.ts`, `domain/dependant-view.ts`, `employees.module.ts`; isolation registry (`staff`).

**Screens.**

| Screen | Change |
|---|---|
| Runway (Overview, Client record) | The three dependant rows carry counts instead of "Not stored yet — coming soon" |
| Overview tile "Documents expiring · 30 days" | Counts dependants' documents |
| Client cards and client record "Expiring 30d" | Count them |
| Reports: tile and six-month forecast | Count them |
| Client manager's Overview | The three rows are gone; no request for dependants is made |

One shared helper, `apps/web/src/lib/dependant-docs.ts`. Each screen counts the dependants of the people it already shows, so dependants follow the same "who counts" rule as the employees beside them. If the read fails, the rows show "Couldn't be read just now" rather than zeros.

## Tests

`apps/api/test/dependant-expiries.e2e-spec.ts` (7), written first.

| Run | Result |
|---|---|
| Before the route existed | **7 failed** (404) |
| After | 7 passed |

Each rule was then broken to see a test fail, and the file restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | No staff check | yes — the test that grants a client role `employee.read` |
| 2 | The company filter is ignored | yes |
| 3 | The response names the dependant | yes (2 tests) |
| 4 | Removed dependants are included | yes (4 tests) |

Without the widened-grant test, proof 1 would not have failed: no client role holds `employee.read`, so the permission alone keeps them out today.

Full API suite: **889/889** (882 + 7). Web typecheck, lint and production build clean.

## Figures against the database (clean seed, local)

The runway's dependant rows on the Overview, as HR officer — the database and the screen agree cell for cell:

| Row | Overdue | ≤7d | 8–14d | 15–30d | 31–60d | 61–90d | Tracked |
|---|---|---|---|---|---|---|---|
| Dependant iqama | 2 | 0 | 1 | 0 | 1 | 0 | 5 |
| Dependant insurance | 2 | 0 | 0 | 0 | 0 | 1 | 5 |
| Dependant passport | 0 | 0 | 0 | 0 | 0 | 0 | 6 |

| Figure | Before | After | Why |
|---|---|---|---|
| Overview "Documents expiring · 30 days" | 19 | **20** | One dependant iqama due in 12 days |
| … "inside seven days" | 7 | 7 | None of a dependant's inside seven days |
| Client cards "Expiring 30d" | – | Alpha 8 · Beta 4 · Gulf 4 · Najd 4 · Al Waha 0 | Sum 20 = the Overview tile |
| Reports "Expiring 30 days" | 19 | **20** | Same rule |
| Reports forecast, Oct–Mar | – | 24 · 11 · 9 · 5 · 6 · 3 | Matches a database count of employees' and dependants' documents per month |

Beta's client record (Arabic): إقامة المُعال 2 overdue of 2 tracked · تأمين المُعال 2 of 2 · جواز سفر المُعال 0 of 3.

## The client manager

Signed in as the sample company's client manager, with the portal switched on for the check:

- `GET /dependants/expiries` → **403**.
- Their Overview's runway has six rows (the employees' documents) and no dependant row.
- The page made **no** request for dependants and does not mention them.

The portal switch was removed afterwards.

## Other checks

- Phone width (375), Arabic, Overview: page overflow 0; the runway scrolls inside its own region as before.
- Arabic wording: the runway said «المرافق» where the bell and the Family tab say «المُعال». Changed to match.
- The administrator's authenticator was enrolled for the Reports check and cleared afterwards (0 enrolled).

## Not done

- Runway cells for dependants are numbers, not links, until DEP-05b.
- The "before" values for the client cards and the forecast were not recorded, so only their totals after the change are shown.
