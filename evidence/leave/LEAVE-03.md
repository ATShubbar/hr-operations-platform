# LEAVE-03 — The balance engine — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → LEAVE-03 (ADR-014 **rev. 1**). Status: **done**.

## Owner decisions (asked; the prototype doesn't make them)

| Question | Answer |
|---|---|
| A mid-year hire's accrual starts… | **From the hire date** (recommended). The prototype accrues everyone from 1 January. |
| Leave crossing 31 December counts… | **Split by day** between the two years (recommended). |

## What was built

| Piece | What |
|---|---|
| `leave/domain/leave-balance.ts` (pure) | `entitlementOn` (21 → 30 on the fifth anniversary itself; 21 with no hire date), `monthsAccrued` (the prototype's `floor(days / 30.44) + 1`, capped at 12, from 1 January or the hire date), `splitByYear`, `computeBalance` (this leave year only; signed `available`, `overdrawn`, sick/unpaid totals), `carryOverFrom` (the 31 December balance, between 0 and 10), `riyadhToday` |
| Filing | writes **one ledger entry per year** the spell touches |
| Migration `20261004150000_leave_balances` | unique `(request_id, leave_year)` instead of `request_id`; `created_by_user_id` nullable (system writes); **partial unique index: one `carried` credit per employee per year** |
| `LeaveBalanceService` | gathers the ledger and pending annual requests through the caller's own fenced path (staff · client via RLS · employee via RLS) |
| `LeaveCarryOverService` | credits everyone still employed (optionally one company); idempotent; audited per credit (`leave-balance` / `carry-over`, system actor for the scheduled run) |
| Worker | `LEAVE_QUEUE`, `LeaveCarryOverScheduler` (`10 0 1 1 *`, Asia/Riyadh) + processor, in `LeaveWorkerModule`, which only `MainModule` loads |
| Routes | `GET /leave/balances` (`?clientId` for staff), `GET /leave/balances/:employeeId` (balance + history), `POST /leave/carry-over` (`leave.carry-over`, Administrator), `GET /me/leave/balance` |
| Permission | `leave.carry-over` → Administrator only. Catalog + matrix cell updated; `role-matrix` pins it |

## Tests

`test/leave-balance.e2e-spec.ts`: **7/7**. Every figure was worked by hand in its comment:

- 276 days → 10 months;
- a hire on 15 June → 4 months by 4 October;
- `round(21 / 12 × 10) = 18`;
- 28 December + 9 days → 4 days + 5 days;
- a leap day inside a spell;
- a full balance `18 + 5 − 5 − 4 = 14` (an entry ending today counts as taken; last year's rows are ignored);
- overdrawn `7 − 10 = −3`;
- carry-over capped (18 → 10), partial (5), overdrawn (0), a mid-year hire (12 → 10), and last year's own carried credit counted;
- Riyadh's calendar day at 21:30 UTC.

`test/leave-balance-api.e2e-spec.ts`: **7/7**, through the real raise → approve → file flow:

- **Starts from entitlement:** 30 days, accrued for the months elapsed.
- **Movements:** filed past leave → taken 3; filed future leave → booked 2; filed sick leave → sick 2, not deducted; a pending request → pending 4, not deducted. `available` dropped by exactly 5.
- **A spell crossing the year end:** booked +3 this year; the history shows **both parts** under one reference (`Y-12-29…31`, 3 days; `Y+1-01-01…02`, 2 days).
- **Client manager:** only their own company's people in the list; another company's employee → 404.
- **Employee:** `/me/leave/balance` is their own (21 with no hire date); the staff balance routes → 403.
- **Carry-over:**
  - HR → 403;
  - an Administrator for company X → `credited 3`: veteran 10, carrier 5 (25 of 30 taken), no-hire-date 10;
  - **the re-run → `credited 0, alreadyCredited 3`**, still 3 rows, 3 audit entries;
  - a direct second credit is refused by the database.

### Red proof

With the service's "already credited" check disabled, the re-run test went red. The database's partial unique index still refused the duplicate, as a 500. Restored → 7/7, and no carry-over rows left behind.

### The worker schedules it

The local worker process logged `leave carry-over scheduled (10 0 1 1 * Asia/Riyadh)`. Redis reads back `leave:carry-over` with the next run at **2027-01-01 00:10 Riyadh** (`2026-12-31T21:10:00Z`).

### Full API suite

**580/580, twice** (563 + 17).

## Carried forward

- **Before production's first 1 January, real opening balances must be loaded** (ADR-014 rev. 1). Otherwise everyone gets the full carry-over cap, because nothing before go-live is recorded as taken.
- The Administrator's "Run carry-over" button in Settings comes with the balance screens (LEAVE-05).
