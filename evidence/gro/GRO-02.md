# GRO-02 — GRO HTTP API (staff CRUD + `gro.process` workflow + client-rep read-own status-only) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → GRO-02 (ACTION-PLAN 4.2)
- Status: done
- Commit: `GRO-02: GRO processes HTTP API — staff workflow + client-rep read-own (status-only)`

## What shipped

The GRO processes HTTP surface — a dual-path resource with **status-only** redaction
for client reps.

| Route | Permission | Scope | Notes |
|---|---|---|---|
| `POST /gro-processes` | `gro.process` | staff | validates the **employee**, **derives clientId from it** (unknown → 404) |
| `GET /gro-processes` | `gro.read` | client-read | dual-path; reps get status-only rows |
| `GET /gro-processes/:id` | `gro.read` | client-read | dual-path, status-only for reps |
| `PATCH /gro-processes/:id` | `gro.process` | staff | core edits |
| `POST /gro-processes/:id/status` | `gro.process` | staff | workflow-validated (illegal → 400) |

- **No DELETE** — the frozen catalog names exactly `gro.read` + `gro.process`; a
  process is retired via the `cancelled` status (like Requests), not hard-deleted.
- **Status workflow** (`domain/gro-status-workflow.ts`): not_started→in_progress→
  submitted→approved→completed; submitted→rejected; rejected→in_progress (retry);
  any active→cancelled; completed/cancelled terminal.
- **Service** grew the client-rep READ path (`listForClient`/`findForClient` via
  `ScopedPrismaService`) + `changeStatus` (validated + audited). Writes stay
  staff-only (clients hold no `gro.process`, `app_client` is SELECT-only).
- **Contracts** (`packages/contracts/src/gro.ts`) — response has nullable
  reference/notes/assignee so the redaction nulls them.

## Status-only redaction (matrix "R own, status only")

Staff see the full row; a **client rep** sees `type/status/dueDate/employeeId` but
**not** `referenceNumber` (government reference), `notes`, or `assigneeUserId`
(internal) — those come back `null`. A `toResponse(row, redacted)` mapper drives it.

## Permission grants — the two frozen GRO permissions

| Role | GRO perms |
|---|---|
| gro_officer | read + process (full management) |
| company_admin | read + process |
| system_admin, hr_officer, read_only | read |
| **recruiter, finance** | **none** |
| client_admin, client_user | read (own, status-only) |

## DoD check

| DoD item | Result |
|---|---|
| Staff CRUD + status transitions; illegal → 400; unknown employee → 404 | ✅ tests 1, 2, 3 |
| Client rep reads OWN only (RLS), STATUS-ONLY (reference/notes/assignee null); foreign id → 404 | ✅ test 4 |
| Client rep CANNOT create/update/advance (403) | ✅ test 5 |
| Finance → 403 on read (gro.read not granted) | ✅ test 6 |
| Every mutation audited; 3 writes declared; write-coverage green | ✅ write-coverage 3/3 |
| Isolation (5 routes) + permission-catalog coverage green | ✅ isolation 10/10; authz 4/4 |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **279/279** |

## Test output (`test/gro-processes-api.e2e-spec.ts`, 7/7)

```
✓ GRO officer creates processes — clientId derived from the employee
✓ rejects create for an unknown employee (404)
✓ advances status along the workflow; rejects an illegal transition
✓ a client rep reads ONLY their own processes, STATUS-ONLY (reference/notes/assignee redacted)
✓ a client rep cannot write processes (403)
✓ Finance staff cannot read GRO (403 — gro.read not granted)
✓ rejects unauthenticated callers (401)
```

Full suite **54 files / 279 passed** (was 272 + 7 new). 3 of 4 full-suite runs were
279/279 green; one showed the documented non-deterministic ioredis/DB teardown flake
(this change touches no Redis; the GRO specs pass deterministically in isolation).

## Files

- `packages/contracts/src/gro.ts` (+ index export)
- `apps/api/src/modules/gro/api/gro-processes.controller.ts` (NEW)
- `apps/api/src/modules/gro/application/gro-processes.service.ts` (+ client-rep read, changeStatus)
- `apps/api/src/modules/gro/domain/gro-status-workflow.ts` (NEW)
- `apps/api/src/modules/gro/gro.module.ts` (+ controller, EmployeesModule)
- `apps/api/src/modules/auth/domain/permissions.ts` (`gro.read` + `gro.process` + grants)
- `apps/api/test/isolation/endpoint-registry.ts` (5 routes) · `test/audit/audited-writes.ts` (3 writes)
- `apps/api/test/gro-processes-api.e2e-spec.ts` (NEW)

## Next (GRO-03)

Cross-module: completing an `iqama_renewal` / `exit_reentry` process **updates the
employee's govdata expiry** (GRO operates on Employees) + a status-change
notification. (Possible: `DocumentExpiring → GRO` auto-spawn — a new ADR-004 flow.)
