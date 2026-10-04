# LEAVE-02 — The leave API — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → LEAVE-02 (ADR-014). Status: **done**.

## Routes

| Route | Permission | Path choice |
|---|---|---|
| `GET /leave` (`?status&employeeId`; staff also `clientId`) | `leave.read` | `scopeOf`: staff cross-client · client manager own company (RLS) · anyone else 403 |
| `GET /leave/:id` | `leave.read` | same; malformed, unknown or another company's id → the same 404 |
| `POST /leave` | `leave.create` | client manager: own employees only (service + `client_raise`) |
| `POST /leave/:id/approve` · `/decline` | `leave.approve` | client manager: own company · Administrator: recorded `decidedOnBehalf` |
| `POST /leave/:id/file` | `leave.file` | **staff only** (bundle **and** a `scopeOf` backstop); writes the ledger |
| `POST /leave/:id/withdraw` | `leave.withdraw` | only the raiser, only while pending |
| `GET /me/leave`, `POST /me/leave`, `POST /me/leave/:id/withdraw` | `self-service.read` / `.create` | the employee's own record; behind `flag.employee-self-service`; body `.strict()` (an `employeeId` is refused) |

- **Responses** (`@hr/contracts` `leave.ts`) name the employee (en/ar) and who raised the request (name + kind, never an email), plus a per-caller `raisedByMe`.
- **Names** come from two lookups per response: `UsersService.principals` and the new `EmployeesService.namesOf`, which names only rows the caller already read.

## Permissions: the ADR-014 row, pinned

`leave.read/create/approve/file/withdraw` were added to the catalog. The bundles are:

- **Administrator:** all five
- **HR officer:** read, create, file, withdraw
- **GRO officer:** read, file
- **Auditor:** read
- **Client manager:** read, create, approve, withdraw
- **Employee:** none (they use `/me` under `self-service.*`)

Proof:
- Adding the bundles first turned `role-matrix` **red for exactly the five roles that changed**.
- I then added the `Leave` row to the spec, and it went **8/8**.

## Notifications

- After the commit, `LeaveStatusChangedEvent` (approved / declined / filed) is published. `LeaveStatusHandler` in Notifications sends a bilingual message to whoever raised the request (ADR-004; Leave never calls `notify()`).
- **Not sent to someone about their own act**, e.g. HR filing a request HR raised.
- A new category, **`leave`**:
  - an enum value, in its own migration (`20261004130000_notification_category_leave`; Postgres won't use a new enum value in the transaction that adds it);
  - added to the contract, the preferences service and the web preferences panel;
  - translated `Leave` / `الإجازات`.

## Registries

- **Isolation harness:**
  - `GET /leave` and `/leave/:id` are `client-read`;
  - raise / approve / decline / withdraw are `client-write`;
  - file is `staff`;
  - `GET /me/leave` is `employee`, probed by the same-company colleague loop (the harness now gives each fixture employee one leave request; responses carry the employee id);
  - the two `/me/leave` writes are `employee-write`.
- **Audited writes:** all 7 write routes are declared (`leave.create/approve/decline/file/withdraw`).
- The harness cleans up its leave fixtures through the owner connection. The staff role deliberately has **no DELETE** on leave (LEAVE-01), and I kept it that way.

## Tests

`test/leave-api.e2e-spec.ts` is **10/10**, over HTTP, one principal per role:

- HR raises → the client manager approves → **the client manager can't file (403)** → HR files. One ledger entry. HR is notified of the approval only, not of their own filing.
- An Administrator approves on the client's behalf (`decidedOnBehalf: true`), and the client manager who raised it is notified.
- A client manager: another company's leave is 404 to read or approve; their list is only their own company; raising for an outsider is refused (400). The other company's manager sees their own.
- Per role:
  - GRO: can't raise, can't approve, **can file**;
  - Auditor: reads only;
  - HR: can't approve.
- Refusals:
  - over the statutory cap, 0 days, a malformed date → 400;
  - deciding a declined request, filing a declined request → 409.
- Withdraw: the client manager and the Administrator get 403 on HR's raise; HR succeeds.
- Employee:
  - raises for themselves; an `employeeId` in the body is refused (400);
  - sees every request **about** them, including those their manager raised, and **none of a colleague's**;
  - can't withdraw what their manager raised (403); a colleague's request is 404;
  - `GET /leave` and `POST /leave` → 403;
  - is notified of a decision: `Annual leave LV-…: approved`, plus Arabic.

**Red proof:** removing `.strict()` from the employee's schema turned the employee-id case red (the id was silently dropped and the request created). Restored, 10/10.

**Full API suite: 563/563, twice** (550 + 13).

## Live (local dev, signed in as the seeded HR officer)

- `GET /api/notifications/preferences` → `{ document_expiry, general, leave, request, system, task }`, all `true`.
- Settings → Preferences shows **"Leave — Email: On — Disable"** between Requests and General (`/en`), and **"الإجازات"** in `/ar`. No missing-translation keys.
- I restarted the dev servers first: new message keys and a new Nest module don't hot-reload (the UX-12 and SS-06a landmines).

Web typecheck + lint clean.
