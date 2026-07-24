# REC-04 — Candidates HTTP API (staff CRUD + pipeline stage workflow) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REC-04 (ACTION-PLAN 4.1)
- Status: done
- Commit: `REC-04: candidates HTTP API — staff CRUD + pipeline stage workflow`

## What shipped

The candidates HTTP surface — **staff-internal** (no client path; candidates carry
applicant PII/CVs clients never see).

| Route | Permission | Notes |
|---|---|---|
| `POST /candidates` | `candidate.create` | service validates the vacancy (unknown → 400), derives clientId |
| `GET /candidates` | `candidate.read` | filters `?vacancyId` `?stage` |
| `GET /candidates/:id` | `candidate.read` | |
| `PATCH /candidates/:id` | `candidate.update` | core edits |
| `POST /candidates/:id/stage` | `candidate.advance` | workflow-validated (illegal → 400) |
| `DELETE /candidates/:id` | `candidate.delete` | hard delete, audited |

- **Stage workflow** (`domain/candidate-stage-workflow.ts`): applied→screening→
  interview→offer→hired; reject/withdraw from any active stage; hired/rejected/
  withdrawn terminal. Reaching `hired` is what REC-05's `CandidateHired → Employees`
  event will hang off.
- **Service** grew `changeStage` (validated + audited `action: 'stage'`) and `remove`.
- **Contracts** (`packages/contracts/src/candidate.ts`) — response maps
  `nameAr`/`nameEn` → `name.{ar,en}`.

## Permission grants — staff-only, same matrix row as vacancies

`candidate.*` is granted per-role (never STAFF_BASE, never client roles):

| Role | candidate perms |
|---|---|
| recruiter | read, create, update, advance, delete (full) |
| company_admin | read, update, advance |
| system_admin, hr_officer, read_only | read |
| **gro_officer, finance** | **none** |
| client_admin, client_user | **none** (no client route exists) |

## DoD check

| DoD item | Result |
|---|---|
| Recruiter CRUD + stage transitions; illegal transition → 400; unknown id → 404 | ✅ tests 1, 3, 4, 9 |
| Create with unknown vacancy → 400 | ✅ test 2 |
| GRO staff → 403 on read | ✅ test 6 |
| Client rep → 403 (no candidate.* / no client route) | ✅ test 7 |
| Every mutation audited; 4 writes declared; write-coverage green | ✅ write-coverage 3/3 |
| Isolation (6 staff routes) + permission-catalog coverage green | ✅ isolation 10/10; authz 4/4 |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **265/265** |

## Test output (`test/recruitment-candidates-api.e2e-spec.ts`, 9/9)

```
✓ recruiter creates a candidate (applied) — clientId derived from the vacancy
✓ rejects a candidate for an unknown vacancy (400)
✓ recruiter updates a candidate
✓ advances the pipeline; rejects illegal jumps
✓ filters the list by vacancy and stage
✓ GRO staff cannot read candidates (403 — candidate.read not granted)
✓ a client rep has no access to candidates (403)
✓ rejects unauthenticated callers (401)
✓ recruiter deletes a candidate
```

Full suite **51 files / 265 passed** (was 256 + 9 new).

## Files

- `packages/contracts/src/candidate.ts` (+ index export)
- `apps/api/src/modules/recruitment/api/candidates.controller.ts` (NEW)
- `apps/api/src/modules/recruitment/application/candidates.service.ts` (+ changeStage, remove)
- `apps/api/src/modules/recruitment/domain/candidate-stage-workflow.ts` (NEW)
- `apps/api/src/modules/recruitment/recruitment.module.ts` (+ CandidatesController)
- `apps/api/src/modules/auth/domain/permissions.ts` (5 candidate.* perms + grants)
- `apps/api/test/isolation/endpoint-registry.ts` (6 staff routes) · `test/audit/audited-writes.ts` (4 writes)
- `apps/api/test/recruitment-candidates-api.e2e-spec.ts` (NEW)

## Next (REC-05)

Offer flow + the **`CandidateHired` → Employees** domain event — advancing a
candidate to `hired` publishes a PII-free event; Employees `@OnEvent` creates the
employee record (the 4th ADR-004 cross-module flow).
