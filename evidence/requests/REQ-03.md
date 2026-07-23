# REQ-03 — Request processing (status workflow + notify) — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → REQ-03 (ACTION-PLAN 4.3)
- Status: done
- Commit: `REQ-03: request processing — status workflow + assignee + notify creator via domain event`

## What shipped

The request lifecycle closes: staff advance a request through its status
workflow, and the client who raised it is notified on every change.

- **`POST /requests/:id/process`** (`request.process`, `@HttpCode(200)`) — STAFF
  only (client reps lack the permission → 403), cross-client. Body `{ status,
  assigneeUserId? }`. Validates the transition, sets/clears the assignee, audits,
  and publishes the event — all through the staff path.
- **Validated status workflow** (`domain/status-workflow.ts`): `open →
  in_progress|cancelled`, `in_progress → resolved|cancelled`, `resolved →
  closed|in_progress`, `closed`/`cancelled` terminal. An illegal edge → 400.
- **Assignment** — additive `assignee_user_id` column; set/cleared via process.
- **Notify via a domain event** — `RequestStatusChangedEvent` (owned by Requests,
  exported from its public-api) is published on an accepted transition;
  `RequestStatusHandler` in Notifications subscribes (`@OnEvent`) and notifies the
  **creator** (in-app + email, category `request`, gated by NOTIF-04 prefs).
  **Requests never imports Notifications** — the ADR-004 pattern; Requests is now
  the second event producer.
- **Permissions** — `request.process` → company_admin, hr_officer, gro_officer
  (the matrix RU-process roles).

## Design decisions recorded

- **Event, not a direct `notify()`** — a direct call would re-couple Requests →
  Notifications, the coupling NOTIF-05 removed. The event keeps the edge
  one-directional (Notifications → Requests, type-only) and consistent.
- **Publish after commit** — the transaction (update + audit) commits first, then
  the event is published (awaited in-process), so the notification reflects a
  persisted status and stays observable within the call (deterministic tests).
- **Staff-only, cross-client** — processing is consultancy work; no scoped path.
- **SLA = the existing `due_date`; `request.delete` deferred** — an SLA-breach
  alert engine (a scan) and archive are out of scope for closing the lifecycle.

## DoD check

| DoD item | Result |
|---|---|
| Staff advance status through legal transitions; illegal → 400; unknown → 404; rep → 403 | ✅ tests 1–3 |
| Assignee set via process | ✅ test 1 (`assigneeUserId` echoed) |
| Every status change notifies the creator (in-app, via event → handler), bilingual, category `request` | ✅ test 1 ("Request updated: In progress") |
| Requests does NOT import Notifications (event-decoupled) | ✅ module-boundary lint + build green |
| Isolation + audited-writes + catalog coverage green | ✅ `POST /requests/:id/process` staff + `request.process` audited |
| Suite + lint + typecheck + build green | ✅ suite **208/208**; lint/typecheck/build clean |

## Test output (`test/requests-process.e2e-spec.ts`, 3/3)

```
✓ staff advance status through legal transitions, set the assignee, and notify the creator
✓ rejects an illegal transition (400)
✓ client reps cannot process (403) and an unknown id is 404
```

The notify path is proven end-to-end: process (staff) → RequestStatusChanged
event → Notifications handler → an in-app notification for the creator ("Request
updated: In progress"). Full suite **41 files / 208 passed**; lint + typecheck +
build clean.

## Deferred (to later REQ/TASK cards)

- **REQ-04** — Requests web UI (staff console: list/create/process; client view
  lands with Portal 5.1).
- `request.delete` (archive); an SLA-breach alert engine.
- **TASK-01..04** — the Tasks module; TASK-03 wires Requests → Tasks via a domain
  event (a third event flow on the ADR-004 bus).
