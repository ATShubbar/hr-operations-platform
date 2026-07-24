# TASK-01 — Tasks foundation (`task_tasks` + TasksService) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → TASK-01 (ACTION-PLAN 4.4)
- Status: done
- Commit: `TASK-01: task_tasks staff-owned table + TasksService + Sun–Thu working-days`

## What shipped

The Tasks foundation — internal staff work items (clients have NO access).

- **`task_tasks`** (TASK-01 migration) — STAFF-owned (unlike `req_requests`):
  `app_staff` full, **no `app_client` grant**, RLS with a `staff_full_access`
  policy (defence-in-depth, no client policy). `client_id`/`request_id` are
  optional reporting links; `created_by_user_id`/`assignee_user_id` nullable so a
  system-spawned task (TASK-03) can be unassigned. Enums `TaskStatus`
  (open/in_progress/done/cancelled) + `TaskPriority` (low/normal/high).
- **`TasksService`** (staff path) — `create` (audited, tx), `list` (filters:
  client/status/assignee + an **own/assigned `scopeUserId`** for TASK-02),
  `findById`.
- **Sun–Thu working days** (`domain/working-days.ts`) — `isWorkingDay` (Fri/Sat =
  weekend) + `addWorkingDays` (skips the weekend), the "Sun–Thu-aware" due-date
  helper.
- **Seed** — 2 tasks (one linked to the seed iqama-renewal request, one
  standalone), assigned to the GRO officer.

## DoD check

| DoD item | Result |
|---|---|
| `task_tasks` staff-owned (app_staff only, RLS staff_full_access, no client grant) | ✅ migration |
| Enums + defaults | ✅ open/normal asserted |
| Service create (audited) / list (+own/assigned scope) / find | ✅ tests 1–2 |
| Sun–Thu working-days helper | ✅ test 3 (Thu +1 → Sun, skips Fri/Sat) |
| Seed adds tasks; migration + db:generate | ✅ seed → "2 tasks" |
| Suite + lint + typecheck + build green | ✅ suite **211/211** |

## Test output (`test/tasks.e2e-spec.ts`, 3/3)

```
✓ creates a task with defaults (open / normal) and writes an audit entry
✓ lists with an own/assigned scope filter
✓ computes Sun–Thu-aware due dates (skips Fri/Sat)
```

Landmine (again): test importing `domain/working-days` deep-path failed the
module-boundary lint → exported via `public-api`. Full suite **211/211**.

## Deferred

- **TASK-02** — HTTP API (own/assigned scope enforced, `task.update`).
- **TASK-03** — Requests → Tasks via a domain event.
- **TASK-04** — Tasks web UI.
