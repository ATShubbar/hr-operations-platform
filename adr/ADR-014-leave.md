# ADR-014 — Leave: requests the employer decides and PEOPLE&GRO files, with statutory balances

- Status: Accepted
- Date: 2026-10-04
- Owner: Ahmed Alshubbar (product decision; LEAVE-00)
- Amends: **architecture.md** "Users & Authorization" scope (v1.1–v1.7 listed *leave* as out of
  scope), the business module list, the permission catalog and the seed permission matrix
  (now **v1.8**). Builds on ADR-011 (employee self-service) and ADR-013 (six roles).

## Context
Leave was explicitly out of scope ("Out of scope: … leave, dependants", architecture.md v1.7,
and ADR-011). The owner's People & Gro prototype — the reference for the product since ADR-012 —
specifies it in full: nine leave types with Saudi Labour Law references, a two-decision flow
(the employer decides, the consultancy files), annual balances with accrual and carry-over, a
Leaves screen (Requests + Balances), *My leave* for employees, and a Leave tab on the person
record. The web app has carried "coming soon" placeholders for these since DS-04.

Nothing exists in the backend: no table, no module, no `leave.*` permission. The prototype gates
leave by role checks only (no permission resource), so the permission design below is ours.

## Options considered
1. **Leave as a request type** (the prototype has a vestige of this: "Annual leave" in its
   request types). Rejected: a leave request has dates, a day count, a balance effect and a
   second decision maker; bending `req_requests` to carry those would make both worse.
2. **A Leave module with its own requests and a ledger** — chosen.

## Decision

### Scope and module
- Leave is **in scope**. A new domain module **`modules/leave`** owns two tables:
  - `lv_leave_requests` — client-scoped (`client_id`), one row per request.
  - `lv_leave_entries` — the **ledger** a balance is computed from: filed leave (linked to its
    request) and annual carry-over credits.
- It reads Employees (hire date, client, status) and Clients through their public APIs and
  publishes domain events (ADR-004) on decisions; Notifications subscribes.
- Self-service (`modules/self-service`, ADR-011) exposes the employee's own leave under `/me/…`.

### The flow (owner decision: the employer decides, then PEOPLE&GRO files)
`pending` → **approved** (or **declined**) by the **client manager** → **filed** by
PEOPLE&GRO staff. A `pending` request can be **withdrawn** by whoever raised it (a distinct
`withdrawn` status — the prototype reuses "declined", which loses who ended it). Filing writes
the ledger entry; nothing touches a balance before that.
- An **Administrator may approve on the client's behalf**; the request records it, and the audit
  entry says so.
- Only filed leave is history. `declined` and `withdrawn` are terminal; `filed` is terminal
  (corrections are a later card).

### Who raises (owner decision)
The **employee** (themselves), the **client manager** (their own company's employees), an
**HR officer** or an **Administrator** (any employee). Not GRO officers, not Auditors. A
terminated employee cannot have leave raised.

### Days, types, caps
- **Calendar days** (owner decision): a start date plus *N* days; the end date is derived
  (`start + N − 1`). Stored as Gregorian dates; Hijri is a rendering (architecture.md).
- The nine types, from the prototype (references are the prototype's own citations, **not a
  legal review** — confirm before production):

  | Type | Pay | Per-request cap | Basis |
  |---|---|---|---|
  | annual | paid | — (may exceed the balance; the excess is unpaid) | Art. 109 — 21 days, 30 after 5 years |
  | sick | tiered | 120 | Art. 117 — 30 full, 60 at ¾, 30 unpaid |
  | maternity | paid | 84 | Art. 151 |
  | paternity | paid | 3 | Art. 113 |
  | marriage | paid | 5 | Art. 113 |
  | bereavement | paid | 5 | Art. 113 |
  | hajj | paid | 15, **once during service** | Art. 114 |
  | emergency | by agreement | — | — |
  | unpaid | unpaid | — | — |

- A request over a type's cap, or a second Hajj, is **refused by the server**.
- **Only annual leave reduces the balance.** The others are recorded; the sick and unpaid totals
  are shown.

### Balances (owner decision: full, as the prototype)
- **Entitlement** 21 days a year, **30** once the employee has 5 years' service from the hire
  date (21 when no hire date is recorded).
- **Leave year** 1 January – 31 December (Gregorian). **Accrual** is monthly:
  `accrued = round(entitlement / 12 × months elapsed)`.
- **Carry-over**: unused annual balance is credited to the next year as a ledger entry, **capped
  at 10 days**, written at the year boundary.
- `available = accrued + carried − taken − booked` — *taken* is filed leave that has ended,
  *booked* is filed leave still to come. **It may go below zero** (shown as overdrawn — the
  excess is unpaid), as in the prototype. Pending leave is shown, never deducted.

### Permissions (new catalog row `leave`)
`leave.read`, `leave.create`, `leave.approve`, `leave.file`, `leave.withdraw`.

| | Administrator | HR officer | GRO officer | Auditor | Client manager | Employee (self) |
|---|---|---|---|---|---|---|
| **Leave** | CR + approve (on the client's behalf) + file + withdraw | CR + file + withdraw (own raises) | R + file | R | CR (own) + approve (own) + withdraw (own raises) | CR (self) + withdraw (self) |

- **Employees never hold `leave.*`** (ADR-011 rev. 2: staff endpoints check permissions without
  looking at the principal). Their access is the `/me/…` routes under `self-service.*`, isolated
  to their own record at the database (RLS on `app.employee_id`), like `/me/requests` (SS-05).
- Client managers reach leave through the client-scoped path (RLS on `app.client_id`).
- *Withdraw* applies only to a `pending` request **the caller raised**.

### Visibility
- Leave is **not** added to the Calendar or the Work queue (as the prototype). The nav count
  shows each role what is waiting on them: client managers — `pending`; staff — `approved`
  (waiting to be filed).
- **Notifications (our addition):** the person who raised a request is notified when it is
  approved, declined or filed (in-app, and email per their preferences).

### Out of scope (later cards)
Public-holiday calendars; opening balances for real employees (a data-migration task before
production — UAT runs on the seed); setting the employee status to `on_leave` automatically;
payroll effects of sick tiers and unpaid leave; correcting a filed leave.

## Revisions
- **rev. 1 (LEAVE-03, 2026-10-04) — balances, two owner decisions the prototype doesn't make.**
  (1) A **mid-year hire accrues from the hire date**, not from 1 January (the prototype accrues
  everyone from the leave-year start). (2) Leave **crossing 31 December is split by day** between
  the two years — filing writes one ledger entry per year (unique per request + year). Also:
  the carry-over is a **yearly job at 00:10 on 1 January, Riyadh** (on the worker; idempotent —
  one credit per person per year, enforced by a partial unique index), and an Administrator may
  re-run it (`leave.carry-over`, optionally for one company). **Consequence for go-live:** with
  no ledger for the years before the system, the first carry-over credits everyone the full cap
  (nothing recorded as taken) — real opening balances (out of scope above) must be loaded before
  the first 1 January in production.

## Consequences
- Line 48's exclusion is gone; a 14th business module and a 21st permission resource exist.
- Two new tables follow `apps/api/src/modules/README.md` (client-scoped table checklist + the
  employee-readable table checklist) and register in the isolation harness, with the same-client
  "other employee" probe.
- The role-matrix spec pins the new row exactly (LEAVE-02).
- The leave rules are the prototype's, not a lawyer's; a wrong rule is a one-line change in the
  leave domain, but filed history would not be recomputed.

## Links
- architecture.md v1.8; ADR-004 (events), ADR-011 (self-service), ADR-012 (prototype fidelity),
  ADR-013 (roles)
- `design/…/People & Gro Console.dc.html` — `LEAVE_TYPES`, `entitlementOf`, `leaveBalance`,
  `LEAVE_REQ`, the Leaves markup
- `BACKLOG.md` → LEAVE-00..06; `evidence/arch/LEAVE-00.md`
