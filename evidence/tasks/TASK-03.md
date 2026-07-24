# TASK-03 — Requests → Tasks via a domain event — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → TASK-03 (ACTION-PLAN 4.4)
- Status: done
- Commit: `TASK-03: a request spawns a task via a domain event (third ADR-004 flow)`

## What shipped

A client request now **spawns an internal task** — the third producer→consumer
flow on the ADR-004 bus, and the architecture's headline "a Request may spawn
Tasks via events".

- **`RequestCreatedEvent`** (owned by Requests, exported via its public-api) —
  published by `RequestsService.create` AND `createForClient` after commit
  (`publishCreated`), so **both** the staff and client-rep create paths spawn a
  task. Requests never references Tasks.
- **`RequestCreatedHandler`** (`@OnEvent(RequestCreatedEvent.NAME)` in Tasks) —
  creates a task linked back to the request (`requestId`, same `clientId`),
  **unassigned** (`createdByUserId`/`assigneeUserId` null → the admin triage queue,
  visible via `task.read-all`), titled `Handle request: <title>`, with a
  **3-working-day (Sun–Thu-aware) SLA** (`addWorkingDays(now, 3)`).
- Tasks imports the event type from Requests (one-directional, type-only). No
  request endpoint changed to add this consumer — the ADR-004 payoff.

## Design decisions recorded

- **Both create paths emit** — any request (staff- or client-created) needs
  handling, so both publish; awaited in-process dispatch makes the spawned task
  observable within the create call (deterministic tests).
- **Spawned task is unassigned** — a system-created task has no creator/assignee,
  so it surfaces only to `task.read-all` holders (admins) to triage/assign
  (consistent with the TASK-02 own/assigned scope).
- **Showcases the Sun–Thu helper** — the SLA due date skips Fri/Sat.

## DoD check

| DoD item | Result |
|---|---|
| Creating a request spawns a task linked to it (both paths) | ✅ test (staff path; client path shares `publishCreated`) |
| Spawned task unassigned, same client, `Handle request:` title, SLA due set | ✅ test |
| Requests does NOT import Tasks (event-decoupled) | ✅ module-boundary lint + build green |
| Suite + lint + typecheck + build green | ✅ suite **218/218** |

## Test output (`test/request-spawns-task.e2e-spec.ts`, 1/1)

```
✓ creating a request spawns an unassigned task linked back to it
```

Proven: `RequestsService.create` → RequestCreated event → Tasks handler → a task
with `requestId` = the request, `clientId` matching, `createdByUserId`/`assigneeUserId`
null, a due date set. The existing REQ e2e cleanups now also delete spawned
tasks. Full suite **218/218** (the intermittent benign BullMQ teardown rejection
is pre-existing, unrelated).

## Deferred

- **TASK-04** — Tasks web UI (triage queue: list/create/update/assign).
