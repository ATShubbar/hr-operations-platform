# REC-05 — Offer flow + `CandidateHired → Employees` domain event — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REC-05 (ACTION-PLAN 4.1)
- Status: done
- Commit: `REC-05: CandidateHired → Employees domain event (4th ADR-004 flow)`

## What shipped

The recruitment loop closes: advancing a candidate to `hired` publishes
`CandidateHiredEvent`, and the **Employees** module (subscribing via `@OnEvent`)
creates the employee record — the **4th ADR-004 cross-module flow** (after
expiry→notify, request→notify, request→task). Recruitment never imports Employees.

- **`CandidateHiredEvent`** (`recruitment/domain/candidate-hired.event.ts`, exported
  from recruitment `public-api`): `candidateId, clientId, vacancyId, nameAr, nameEn,
  nationality, correlationId`. An INTERNAL in-process event (the no-PII rule governs
  external/calendar payloads, not the bus).
- **`CandidatesService.changeStage`** publishes it AFTER commit when the target stage
  is `hired`. Awaited + error-isolated by the bus — a failing consumer never rolls
  back the committed hire.
- **`CandidateHiredHandler`** (`employees/application/candidate-hired.handler.ts`,
  `@OnEvent(candidate.hired)`) creates the employee via `EmployeesService.create`:
  `clientId` + name + `nationality` from the event; `contractType: 'unlimited'`
  (onboarding default HR adjusts — a valid enum, not a fabricated fact);
  `employmentStatus: 'active'`. Audited as `employee.create`. HR completes
  salary/govdata afterward.

## The modelling gap closed — nationality

An `Employee` requires `nationality`; a candidate didn't have one. So:
- **Added `nationality` (optional, ISO-2) to `rec_candidates`** (additive migration),
  threaded through the candidate create/update contract + service.
- **Hire guard:** advancing to `hired` requires a nationality on file — else **400**
  ("Candidate nationality is required before hiring"). The resulting employee is
  always well-formed.

## Idempotency — no ledger needed

`hired` is terminal (`canTransition(hired, *) === false`), so `changeStage → hired`
succeeds **at most once** per candidate → the event fires once → exactly one
employee. Proven by the "hired is terminal" test.

## No DI cycle

Recruitment does not import Employees. Employees imports only the event **type**
from recruitment's `public-api` (a value import for `.NAME`); the bus is `@Global`,
so `EmployeesModule` needs no `RecruitmentModule` import. Boundary lint green.

## DoD check

| DoD item | Result |
|---|---|
| Hiring (with nationality) creates an Employee for the same client, name + nationality, audited | ✅ test 1 |
| Hiring without nationality → 400; no employee created | ✅ test 2 |
| `hired` terminal → event fires once → exactly one employee | ✅ test 3 |
| Recruitment doesn't import Employees; no DI cycle; boundary lint green | ✅ lint green; app boots |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **268/268** |

## Test output (`test/recruitment-candidate-hired.e2e-spec.ts`, 3/3)

```
✓ hiring a candidate creates an employee for the same client (with name + nationality)
✓ refuses to hire a candidate with no nationality on file (400), creating no employee
✓ `hired` is terminal — a second transition is rejected, so only one employee exists
```

Full suite **52 files / 268 passed** (was 265 + 3 new). The runner's 2 trailing
errors are the documented benign ioredis "Connection is closed" teardown flake.

## Regression handled

REC-05's nationality-at-hire guard broke the REC-04 candidates-api test (it hired a
candidate created without nationality). Fixed in the same commit: that test now
creates the hired candidate with `nationality: 'SA'` and cleans up the spawned
employee. Caught by running the recruitment specs together.

## Files

- `apps/api/prisma/schema.prisma` + migration `20260724173249_candidate_nationality`
- `packages/contracts/src/candidate.ts` (+ nationality)
- `apps/api/src/modules/recruitment/domain/candidate-hired.event.ts` (NEW) + public-api export
- `apps/api/src/modules/recruitment/{domain/candidate.ts, api/candidates.controller.ts}` (+nationality)
- `apps/api/src/modules/recruitment/application/candidates.service.ts` (hire guard + publish; EventBus)
- `apps/api/src/modules/employees/application/candidate-hired.handler.ts` (NEW) + employees.module.ts
- `apps/api/prisma/seed.ts` (candidate nationalities)
- `apps/api/test/recruitment-candidate-hired.e2e-spec.ts` (NEW) · `recruitment-candidates-api.e2e-spec.ts` (regression fix)

## Deferred

- A **notify-on-hire** consumer (Notifications `@OnEvent(candidate.hired)`) — the
  architecture mentions "Notifications fires"; REC-05 delivers the defining
  Employees-creation flow, a hire notification can follow.
- Linking the created employee back to the candidate (`sourceCandidateId`) — omitted
  to avoid employee-schema churn; traceability is via the audit trail + correlationId.

## Next (REC-06)

Recruitment web UI — vacancies list + a candidate pipeline board (with the hire
action), closing the epic.
