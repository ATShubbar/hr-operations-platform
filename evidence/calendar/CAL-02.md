# CAL-02 — Calendar HTTP API (own-scoped event CRUD + aggregated calendar-view) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → CAL-02 (ACTION-PLAN 5.2)
- Status: done
- Commit: `CAL-02: Calendar HTTP API — own-scoped event CRUD + aggregated calendar-view`

## What shipped

The Calendar HTTP surface — staff-only own-scoped event CRUD plus the delivery-layer
payoff: a view that merges own events with read-only deadlines from Tasks/Requests/GRO.

| Route | Permission | Scope |
|---|---|---|
| `POST /calendar/events` | `calendar.create` | owner = actor |
| `GET /calendar/events` | `calendar.read` | own (all if `calendar.read-all`); `?from`/`?to` |
| `GET /calendar/events/:id` | `calendar.read` | own / any (read-all) → else 404 |
| `PATCH /calendar/events/:id` | `calendar.update` | own / any (read-all) |
| `DELETE /calendar/events/:id` | `calendar.delete` | own / any (read-all) |
| `GET /calendar/view` | `calendar.read` | merged **events + Task/Request/GRO deadlines** in `[from,to]` |

- **Own-scope** mirrors Tasks: events owned by `ownerUserId = actor`; `calendar.read-all`
  lifts read/update/delete to any. A non-read-all actor hitting another owner's event
  id gets **404** (existence not leaked).
- **The calendar-view aggregation** — for `[from,to]` it merges own events (or all,
  read-all) with **active** deadlines: Task (assigned-to-actor, or all with
  `task.read-all`), Request, and GRO — **each source gated by its read permission via
  `PolicyService.can`** (all staff read tasks/requests; GRO only for `gro.read` holders).
  Terminal items (task done/cancelled, request closed/cancelled, gro completed/rejected/
  cancelled) are excluded. Returns unified `items[]` with `kind: event|task|request|gro`.

## Permission grants (matrix)

| Role | calendar perms |
|---|---|
| all staff | read (own by default) |
| system_admin, read_only | + read-all (read all, no write) |
| company_admin | + read-all, create, update, **delete** (CRUD all) |
| recruiter, hr_officer, gro_officer, finance | + create, update (CRU own) |
| clients | **none** |

## DoD check

| DoD item | Result |
|---|---|
| Event CRUD; own-scope (non-read-all → 404 on others' events); read-all sees all | ✅ tests 1, 2 |
| `calendar-view` merges own events + active Task/Request/GRO deadlines; terminal excluded | ✅ test 6 |
| A Recruiter's view OMITS GRO (no gro.read) but includes requests | ✅ test 7 |
| `calendar.delete` Company-Admin-only (hr_officer → 403); clients → 403; unauth → 401 | ✅ tests 3, 4, 5 |
| `view` requires from + to (400) | ✅ test 8 |
| Every mutation audited; 3 writes declared; write-coverage green | ✅ write-coverage 3/3 |
| Isolation (6 staff routes) + permission-catalog coverage green | ✅ isolation 10/10; authz 4/4 |
| No DI cycle (Calendar → Tasks/Requests/GRO one-way) | ✅ boundary lint green; app boots |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **296/296** |

## Test output (`test/calendar-api.e2e-spec.ts`, 8/8)

```
✓ hr_officer creates an event (owner = self)
✓ own-scope: another staff cannot fetch hr_officer event (404); read-all can
✓ delete is Company-Admin-only (hr_officer → 403)
✓ a client rep has no calendar access (403)
✓ rejects unauthenticated callers (401)
✓ the view merges own events + active Task/Request/GRO deadlines (done excluded)
✓ a recruiter's view omits GRO (no gro.read) but includes requests
✓ the view requires from and to (400)
```

Full suite **57 files / 296 passed** (was 288 + 8 new).

## Files

- `packages/contracts/src/calendar.ts` (+ index export)
- `apps/api/src/modules/calendar/api/calendar.controller.ts` (NEW)
- `apps/api/src/modules/calendar/domain/calendar-view.ts` (NEW — active-status filters + item mappers)
- `apps/api/src/modules/calendar/calendar.module.ts` (+ controller, Auth/Tasks/Requests/Gro imports)
- `apps/api/src/modules/auth/domain/permissions.ts` (5 calendar.* + grants)
- `apps/api/test/isolation/endpoint-registry.ts` (6 staff routes) · `test/audit/audited-writes.ts` (3 writes)
- `apps/api/test/calendar-api.e2e-spec.ts` (NEW)

## Next (CAL-03)

Calendar web UI — an agenda/month view over `/calendar/view` (events + deadlines,
dual-calendar Hijri) + create/edit events; closing the Calendar epic.
