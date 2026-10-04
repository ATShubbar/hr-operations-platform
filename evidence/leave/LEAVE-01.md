# LEAVE-01 — Leave tables + the service — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → LEAVE-01 (ADR-014). Status: **done**. No HTTP routes; those are LEAVE-02.

## What was built

| Piece | What |
|---|---|
| Migration `20261004120000_leave` | `lv_leave_requests` and `lv_leave_entries`; enums `LeaveType` (9), `LeaveStatus` (`pending/approved/declined/withdrawn/filed`), `LeaveEntryKind` (`taken/carried`); a `LV-0001…` reference sequence |
| Integrity (CHECKs) | days between 1 and 365; **`end_date = start_date + days − 1`** (calendar days); `approved/declined/filed` must record who decided and when; `filed` must record who filed and when; `withdrawn` must record when; a ledger `taken` entry needs a request and dates; `carried` is annual with no request |
| `modules/leave/domain/leave-rules.ts` | the nine types (cap · once · deducts · basis); `leaveEndDate`; `raiseRefusal` (leaver, days 1–365, whole days, cap, Hajj once); `canMove` (pending → approved/declined/withdrawn, approved → filed) |
| `LeaveService` | the three paths from ADR-014: staff, client manager (`ScopedPrismaService`), employee (`EmployeeScopedPrismaService`). Every write is audited in the same transaction (`resource 'leave'`, the request id, the request's company). Filing writes the status **and** the ledger entry together. Status moves are conditional updates, so a lost race gets **409**, not an overwrite. |
| `modules/leave` | module + public API, registered in `AppModule` |

## The database fence

| Audience | Grants | Policies |
|---|---|---|
| `app_staff` | SELECT, INSERT, UPDATE on requests; SELECT, INSERT on the ledger; **no DELETE** | `staff_full_access` |
| `app_client` | SELECT, INSERT; **UPDATE only on** `status, decided_by_user_id, decided_at, withdrawn_at, updated_at`; ledger SELECT only | `client_isolation` (own company); **restrictive** `client_raise` (pending, undecided, unfiled, not employee-raised, employee visible to this company) and `client_decide` (only `pending` rows, only to approved/declined/withdrawn) |
| `app_employee` | SELECT, INSERT; **UPDATE only on** `status, withdrawn_at, updated_at`; ledger SELECT only | `employee_self` (rows about me); `employee_raise` (me, raised by me, my record's company, pending/undecided); `employee_withdraw` (only my own raises, pending → withdrawn) |

## Tests

- `test/leave-rules.e2e-spec.ts`: **7/7**. Calendar-day ends across months, years and a leap day; only annual deducts; refusals; Hajj once; every legal and illegal move.
- `test/leave.e2e-spec.ts`: **14/14**.
  - **The service:**
    - raise → approve (client) → file writes the ledger entry, audited `create, approve, file` on the request's company;
    - an Administrator's decision is recorded as on the client's behalf;
    - a request can't be decided twice, filed twice or filed early (409);
    - **two concurrent decisions: exactly one wins, the other gets 409**;
    - over-cap, a second Hajj, and a leaver are refused (400);
    - a client manager can only raise for their own people;
    - only the raiser withdraws (403 for anyone else, 409 once it's no longer pending);
    - the employee path: raise for myself, see leave raised *for* me but not withdraw it, a colleague's request is invisible.
  - **The database, on raw role connections with no service:**
    - a client sees only its own company;
    - a client can't raise for another company's employee, or insert a pre-approved request;
    - **a client can never file**, re-decide or write the ledger;
    - an employee sees nothing of a **same-company colleague**, can't raise for them or pre-approve, and can't approve their own leave.

### Red proof: each policy is load-bearing

Each policy was loosened on the local database, the spec re-run, then restored:

```
1. drop client_decide  → × app_client … can never file, re-decide a decided request, or write the ledger   (1 failed)
2. drop client_raise   → × app_client … cannot raise for another company's employee, or raise one already approved   (1 failed)
3. employee_self USING (true) → × … sees nothing of a same-company colleague
                              → × … an employee raises for themselves, sees their own leave …   (2 failed)
restored               → 14 passed
```

### The SS-01 source scan caught a forbidden shape in my first draft

`principalType === 'client_rep' ? undefined : row.clientId` (choosing the audit's company) failed `auth-employee-principal`'s scan. It's now simpler: every path names the request's own company, which on the client path *is* the scope that the `aud_entries` policy requires.

### Full API suite

**550/550, twice** (was 517 + 33 new).

## Not in this card

- HTTP routes, `leave.*` in the role bundles, the isolation-harness registrations and audited-route declarations: **LEAVE-02**.
- Balances: **LEAVE-03**.
- Seed data: **LEAVE-06**.
- The migration reaches UAT with the next deploy; its grants and policies are additive.
