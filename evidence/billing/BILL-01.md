# BILL-01 — The government-fee ledger: data, API and the standard-fee setting — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-020. Card approved in advance ("approved for all"). No screen yet (BILL-02 onward).

## What changed

| Area | Change |
|---|---|
| Database | Migration `20261012120000_billing_fees`: `bil_fees` with a `GF-0001…` reference, the client, an optional employee, what the fee was for (by hand, a sequence step, or a procedure), the authority, the amount in **whole halalas**, the day paid, a status (`recorded`, `invoiced`, `void`), and who recorded or voided it. Two partial unique indexes: one live fee per sequence step, one per procedure. CHECKs: amount is positive; each kind of fee carries what its kind requires; a void fee has who, when and why and no other fee does. **Staff-owned**: `app_staff` may SELECT, INSERT and UPDATE; no role may DELETE; `app_client` and `app_employee` have no grant. |
| New module | `modules/billing` (reads Clients, Employees and GRO; none of them imports it). `FeesService`: list with filters, create, correct, void, each write audited in its own transaction against the fee. `FeesController`: `GET /fees`, `POST /fees`, `PATCH /fees/:id`, `POST /fees/:id/void`. |
| Rules in the service | A fee for a step or a procedure takes its company and person **from that record**, so it cannot be charged elsewhere. A step's fee needs the step filed. A manual fee's person must work at the company it names. Corrections only while `recorded`; only a manual fee has wording. A fee is voided with a reason and never deleted. The paid date is not in the future (one day of slack). The authority defaults to the step's portal. |
| Permissions | `fee.read`, `fee.create`, `fee.update`, `fee.delete` (void). Administrator, HR officer and GRO officer hold all four; the Auditor holds `fee.read`. The role-matrix spec has the new row. |
| Setting | `billing.standard-fees` (system level): a fee per procedure type, per sequence step and per dependant per year, in halalas. Strict and complete: a missing or unknown key is refused. Seeded with the prototype's figures, which are not verified. |
| Contracts | `billing.ts` (strict schemas, the response shape) and `billing-lists.ts` (no zod; subpath `@hr/contracts/billing-lists`): authorities, statuses, the default standard fees, `authorityOfPortal`. |
| Audit | `fee` is graded notable, and a void critical. |
| Registries | Four routes in the isolation registry as `staff`; three in the audited-writes list. |
| Web | One line: the Roles and permissions matrix labels the new resource "Government fees". |

## Tests

`test/billing-fees.e2e-spec.ts`, **14 tests**. They were written before the module, but I could not run them red first: they do not compile without the table and the service. So each rule is proven by breaking it instead (below).

- A fee recorded by hand reads back with exactly the expected keys, a `GF-` reference and its recorder's name, and is audited with the amount.
- A manual fee may name a person at that company; a person from another company is 400; an unknown company is 404.
- A step's fee: 409 before the step is filed; then 201 with the company, person and sequence kind from the run and the authority from the step's portal; 409 the second time; unknown step or run 404.
- A procedure's fee: authority required; company, person and type from the procedure; 409 the second time.
- 15 invalid bodies are each 400 and nothing is recorded (zero, negative, fractional, above SAR 1,000,000, a string, a future date, `2026-02-30`, an unknown authority, no authority, blank wording, an unknown kind, a caller-set status or reference).
- A correction changes the amount, day, authority and wording; the audit entry has before and after; a step's fee cannot be reworded.
- A void needs a reason, keeps the row and the amount, cannot be repeated, blocks further correction, and frees the step for a new fee.
- The list filters by company, person, status and day paid, never mixes companies, and refuses an unknown filter.
- Who: officers and the Administrator write; the Auditor reads and is refused every write; a client manager and an employee are refused everything; anonymous is 401.
- The setting: every role reads the defaults; the step defaults equal the sequence definitions' fees × 100; only the Administrator changes it; five malformed values are refused; changing it alters no recorded fee.
- The database: the client and employee roles cannot read or insert; the staff role cannot delete; five malformed rows are refused, including a second live fee for one step.
- A separate app with a **widened policy** (a client manager granted `fee.*`): still 403 on all four routes for their own company.

**Red proofs** (the rule broken, the spec fails, the file restored and compared byte for byte; database changes reverted and checked):

| Broken | Failed |
|---|---|
| The list route's staff check | 1 (the widened-policy test) |
| The create route's staff check | 1 |
| A step need not be filed | 1 |
| A person need not work at the company | 1 |
| The duplicate not mapped to 409 | 2 |
| A void fee can be corrected | 2 |
| Any fee can be reworded | 1 |
| Future payments accepted | 2 |
| Authority not taken from the step | 1 |
| `app_client` granted SELECT | 1 |
| `app_staff` granted DELETE | 1 |
| The one-per-step index dropped | 3 |
| **The "already void" check removed** | **0** — the void is a conditional update, which refuses a second void by itself. The check only gives a clearer message. |

**Gates:** full API suite **764/764, twice** (750 + 14). API `typecheck` and `lint` clean; contracts build and 18/18; web `typecheck` clean. After the proofs: `app_staff` holds INSERT, SELECT, UPDATE on `bil_fees` and nothing else is granted; both partial indexes exist.

## Not in this card

- No screen records or shows a fee yet.
- Receipts (BILL-02), invoices and the `invoiced` status (BILL-05), and the rule that an invoiced fee cannot be voided, which is written but cannot be tested until invoices exist.
- No seeded fees (BILL-06).
