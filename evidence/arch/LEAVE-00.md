# LEAVE-00 — Leave into the architecture (ADR-014, architecture.md v1.8) — Evidence

- Date: 2026-10-04
- Status: **done** — documentation only; no code, nothing deployed.

## Owner decisions (asked one by one, answers recorded)

| Question | Answer |
|---|---|
| Who decides a leave request? | **The client manager approves or declines, then PEOPLE&GRO files it** (recommended). An Administrator may approve on the client's behalf, recorded as such. |
| How are leave days counted? | **Calendar days**: a start date plus N days, weekends included. |
| How much balance logic in v1? | **Full, as in the prototype** (recommended): 21/30 days by service, monthly accrual from 1 January, carry-over capped at 10, taken vs booked, overdrawn = unpaid. |
| Who can raise? | **Also HR officers**: the employee, the client manager (own company), an HR officer, an Administrator. |
| The LEAVE-00 card, including GRO "read + file" (as the prototype) and the added decision notifications | **approved** |

## What the research found before the card (read, not assumed)

- `architecture.md` v1.7 line 48 listed leave as **out of scope**, and ADR-011 repeated it. There was no Leave module in the business-module list.
- The backend had no `leave.*` permission, no table and no module. The web app had only `ComingSoonPage` placeholders: `/leaves`, `/me/leave`, and the Person record's Leave tab.
- The prototype (`design/…/People & Gro Console.dc.html`) specifies:
  - `LEAVE_TYPES`: nine types with caps and Labour Law article references;
  - `entitlementOf`: 21 days, or 30 after 5 years;
  - `leaveBalance`: accrual / carried / taken / booked / available, allowed below zero;
  - the `pending → endorsed → filed | declined` flow and the clash check;
  - the Leaves screen, My leave, and the Person record's Leave tab.
- The prototype gates leave by **role checks only** (no permission resource), and doesn't put leave in the Calendar or the Work queue.

## What changed

| File | Change |
|---|---|
| `adr/ADR-014-leave.md` | NEW. The module, the flow, who raises, days/types/caps, balances, the `leave.*` permissions + matrix row, visibility, out of scope, consequences. |
| `architecture.md` | **v1.8**: changelog; "leave" removed from Out of scope (+ history note); the catalog row `Leave → leave`; the matrix row; module **10. Leave** (later modules renumbered); Self-Service now also covers Leave. |
| `adr/ADR-011-employee-self-service.md` | Its "out of scope: leave" line now points to ADR-014. |
| `adr/README.md` | ADR-014 indexed. |
| `BACKLOG.md` | LEAVE-00 (done), LEAVE-01..06. |

## Decisions of ours, flagged for the owner in the card

- A distinct `withdrawn` status. The prototype reuses `declined`, which loses who ended the request.
- **Server-side refusal** above a type's cap, and of a second Hajj. The prototype only shows a note.
- **Decision notifications** to whoever raised the request (the prototype only audits).
- **Employees never hold `leave.*`**, only the `/me/…` routes under `self-service.*` (ADR-011 rev. 2).
- The Labour Law references are the prototype's citations, **not a legal review**. The ADR says so.
