# TASK-02 — Tasks HTTP API (own/assigned scope) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → TASK-02 (ACTION-PLAN 4.4)
- Status: done
- Commit: `TASK-02: Tasks HTTP API — CRU own/assigned + task.read-all scope, delete`

## What shipped

The Tasks API — staff-only, cross-client, with the matrix **own/assigned** scope.

- **`TasksController`** — `POST /tasks` (`task.create`), `GET /tasks`
  (`task.read`), `GET /tasks/:id` (`task.read`), `PATCH /tasks/:id`
  (`task.update`), `DELETE /tasks/:id` (`task.delete`).
- **Own/assigned scope** — a finer, in-handler check (`PolicyService.can(role,
  'task.read-all')`) on top of the coarse permission: holders of `task.read-all`
  (Admins + Read Only) see/act on every task; everyone else is restricted to
  tasks they **created or are assigned to** (list filtered; get/update on a
  foreign task → 404). `TasksService.list` takes an own/assigned `scopeUserId`.
- **`TasksService`** gains `update` (audited) + `remove` (audited hard delete).
- **Permissions** (matrix): `task.read` → all staff; `task.read-all` →
  system_admin/company_admin/read_only; `task.create`/`task.update` →
  company_admin + recruiter/hr_officer/gro_officer/finance; `task.delete` →
  company_admin.

## Design decisions recorded

- **`task.read-all` encodes the scope, permission-based (not role-based).** The
  handler checks the capability, never a role name (ADR-002). Read Only holds it
  (sees all) but no `task.update` (can't write) — matching the matrix "R (all)".
- **Staff-only, cross-client** — no client-rep path (clients have no task
  access); registered `staff` in the isolation harness.
- **Delete is a hard delete** (no "deleted" status), audited with a before
  snapshot; company_admin only.

## DoD check

| DoD item | Result |
|---|---|
| Create; own/assigned hides from other non-admins, visible to admins | ✅ test 1 |
| Assignee sees their assigned task | ✅ test 2 |
| Non-admin GET/PATCH outside scope → 404; own → 200 | ✅ test 3 |
| Read Only reads all, cannot create/update → 403 | ✅ test 4 |
| Delete company_admin only (403 for others); deleted → 404 | ✅ test 5 |
| Unauthenticated → 401 | ✅ test 6 |
| Isolation + audited-writes + catalog coverage green | ✅ 5 routes staff; POST/PATCH/DELETE audited; 5 new perms |
| Suite + lint + typecheck + build green | ✅ suite **217/217** |

## Test output (`test/tasks-api.e2e-spec.ts`, 6/6)

```
✓ creates a task; own/assigned scope hides it from other non-admins but not admins
✓ an assignee sees their assigned task
✓ a non-admin cannot GET/PATCH a task outside their scope (404) but can act on own
✓ read_only sees all tasks but cannot create or update (403)
✓ delete is company_admin only
✓ rejects unauthenticated callers (401)
```

Full suite **217/217** (the intermittent benign BullMQ teardown rejection is
pre-existing, unrelated). lint + typecheck + build clean.

## Deferred

- **TASK-03** — Requests → Tasks via a domain event.
- **TASK-04** — Tasks web UI.
