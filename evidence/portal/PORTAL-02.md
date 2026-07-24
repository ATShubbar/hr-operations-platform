# PORTAL-02 — `GET /portal/employees` (own, redacted core + govdata:status) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → PORTAL-02 (ACTION-PLAN 5.1)
- Status: done
- Commit: `PORTAL-02: portal employees — own client, redacted core + govdata:status`

## What shipped

Client reps can now read **their own** employees through the portal, redacted to
**core profile + government status/expiry only** — no salary, no government
identifier numbers. This activates the **`govdata: 'status'` tier** that the
EMP-02 mapper was built for but staff never exercised.

- **Shared redaction mapper extracted** — `toEmployeeResponse` + the
  `EmployeeVisibility` type moved out of the staff controller into
  `employees/domain/employee-view.ts`, exported via the module's `public-api.ts`.
  Both the staff `EmployeesController` and the portal now map through the SAME
  field-sensitivity rules — one source of truth for what each capability sees.
  The staff controller's behavior is unchanged (a pure refactor).
- **`GET /portal/employees`** (`portal.read` + flag-gated) — the caller's own
  client's employees, each redacted with fixed `{ salary: false, govdata: 'status' }`.
- **`GET /portal/employees/:id`** — one own employee, same redaction; **404 (not
  403)** for another client's employee or an unknown id, so the portal never
  leaks the existence of out-of-scope records.
- The client scope is always `requestContext.clientId` (session) — never input.
  `EmployeesModule` added to `PortalModule` imports (still a leaf → no cycle).

## The `status` tier — what a rep sees vs. not

| Group | Field examples | Portal (`status`) |
|---|---|---|
| core | name, jobTitle, department, hireDate, employmentStatus | ✅ visible |
| salary | basicSalary, bankIban, wpsStatus | ❌ `salary: null` (whole group) |
| govdata **identifiers** | iqamaNumber, nationalId, passportNumber, gosiRegistrationNumber, absherServiceRef | ❌ each `null` |
| govdata **status/expiry** | iqamaExpiry, workPermitExpiry, exitReentryStatus, gosiRegistrationStatus | ✅ visible |

Rationale: a rep needs expiry *dates* (they'll consume the expiry engine) but the
raw government ID *numbers* stay in staff custody.

## DoD check

| DoD item | Result |
|---|---|
| Rep lists ONLY their own employees; cross-client `:id` → 404; unknown id → 404 | ✅ tests 2, 4, 5 |
| salary null; govdata identifiers null; govdata status/expiry present | ✅ tests 2, 3 |
| Flag off → 403; staff (no portal.read) → 403; unauth → 401 | ✅ tests 1, 6, 7 |
| Staff employees behavior unchanged (refactor) | ✅ employees.e2e (3) + employees-api.e2e (13) green |
| Isolation (`client-read`) + catalog coverage green | ✅ both routes registered; isolation 10/10 |
| Suite + lint + typecheck + build green | ✅ suite **229/229**; lint + tsc + build clean |

## Test output (`test/portal-employees.e2e-spec.ts`, 7/7)

```
✓ is blocked (403) while flag.client-self-service is off
✓ lists ONLY the caller own client employees, redacted
✓ GET :id returns the own employee, redacted
✓ GET :id for another client employee is 404 (existence not leaked)
✓ GET :id for an unknown id is 404
✓ is client-only — staff lack portal.read (403)
✓ rejects unauthenticated callers (401)
```

Full suite **46 files / 229 passed** (was 222 + 7 new). The suite runner exits 1
on a non-deterministic (1 then 2) benign ioredis "Connection is closed"
teardown rejection surfaced via health.e2e — the documented BullMQ landmine,
unrelated to this change (touches only employees/portal, no Redis); all 229
tests pass. No orphaned dev worker present.

## Deferred (to later PORTAL cards)

- **PORTAL-03** — `GET /portal/documents[/:id/download]`: rep reads/downloads own
  documents.
- **PORTAL-04** — the client portal **UI** (flag-gated shell + company / employees
  / documents / requests pages).
