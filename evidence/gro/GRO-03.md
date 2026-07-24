# GRO-03 — Completion updates Employees govdata + notify on status change — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → GRO-03 (ACTION-PLAN 4.2)
- Status: done
- Commit: `GRO-03: completing a GRO process writes govdata expiry back to the employee + notifies the assignee`

## What shipped

The cross-module payoff — GRO *operates on* Employees. Completing an expiry-
establishing process writes the new government-document expiry back to the
employee's govdata, and every status change notifies the assignee.

- **New field `resultingExpiry`** (date) on `gro_processes` — the gov-doc expiry the
  process establishes; set via `PATCH`, in the response. Additive migration.
- **On `changeStatus → completed`** (after commit): if the type maps to a govdata
  expiry field AND `resultingExpiry` is set, `EmployeesService.update(employeeId,
  { <field>: resultingExpiry }, 'gro-completion')`. Map (`domain/gro-effects.ts`):
  `iqama_issue`/`iqama_renewal → iqamaExpiry`, `exit_reentry → exitReentryExpiry`,
  `work_permit_renewal → workPermitExpiry`; other types write nothing. Audited as an
  `employee`/`gro-completion` update.
- **On any status change** (after commit): if `assigneeUserId` is set,
  `NotificationsService.notify(...)` a bilingual "process is now `<status>`" note
  (category `general`, `data: { groProcessId }`).

## Design decision — direct calls, not a 5th ADR-004 event

GRO already imports EmployeesModule (GRO-02, to validate the subject employee +
derive its clientId). An Employees→GRO event (for the completion write) would create
a **GRO↔Employees DI cycle**. GRO "consumes Employees + Notifications" is the
architecture's stated design (module 6), so **direct service calls** into those
declared dependencies are correct here — not the "multi-module orchestration" the
event rule guards against. (The CandidateHired event pattern is right where the
producer is otherwise decoupled from the consumer; GRO isn't.) Effects run AFTER
the status commits, so a failing effect never rolls back the transition. Boundary
lint green; the app boots (no cycle).

## DoD check

| DoD item | Result |
|---|---|
| Completing `iqama_renewal` (resultingExpiry set) → employee `iqamaExpiry` updated; audited | ✅ test 1 (emp.iqamaExpiry = 2028-06-30; `employee`/`gro-completion` audit row) |
| Non-mapping type (`sponsorship_transfer`) completing → NO govdata write | ✅ test 3 (workPermitExpiry stays null) |
| Completing with no `resultingExpiry` → writes nothing | ✅ test 4 |
| Status change with an assignee → notification created | ✅ test 2 (general note, body "…process is now…") |
| No DI cycle (GRO→Employees/Notifications one-way) | ✅ boundary lint green; suite boots AppModule |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **283/283** |

## Test output (`test/gro-completion.e2e-spec.ts`, 4/4)

```
✓ completing an iqama_renewal writes resultingExpiry to the employee iqamaExpiry
✓ notifies the assignee on status change
✓ a non-mapping type (sponsorship_transfer) completing writes NO govdata
✓ completing WITHOUT a resultingExpiry writes nothing
```

Full suite **55 files / 283 passed** (was 279 + 4 new).

## Files

- `apps/api/prisma/schema.prisma` + migration `20260724181223_gro_resulting_expiry`
- `packages/contracts/src/gro.ts` (+ `resultingExpiry`)
- `apps/api/src/modules/gro/domain/gro-effects.ts` (NEW — type→field map + bilingual content)
- `apps/api/src/modules/gro/domain/gro-process.ts` (+ resultingExpiry input)
- `apps/api/src/modules/gro/application/gro-processes.service.ts` (after-commit effects; +Employees/Notifications)
- `apps/api/src/modules/gro/api/gro-processes.controller.ts` (+ resultingExpiry in response)
- `apps/api/src/modules/gro/gro.module.ts` (+ NotificationsModule)
- `apps/api/test/gro-completion.e2e-spec.ts` (NEW)

## Deferred

- **`DocumentExpiring → GRO auto-spawn`** — a cleaner one-way event flow (GRO
  subscribes to the document-expiry engine's event and opens a renewal process). A
  genuine 5th ADR-004 flow, but its own card — not folded into GRO-03.

## Next (GRO-04)

GRO web UI — a process list/board with **dual-calendar Hijri deadlines**, status
transitions, and the completion (resulting-expiry) action; closing the GRO epic
(the client-portal GRO view is a possible follow-on).
