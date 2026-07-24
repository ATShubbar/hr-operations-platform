# CAL-01 — `cal_events` table + CalendarService (staff path) + seed — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → CAL-01 (ACTION-PLAN 5.2)
- Status: done
- Commit: `CAL-01: cal_events staff-owned table + CalendarService`

## What shipped

The Calendar epic's foundation — the staff event primitive + service. No HTTP
surface / permissions yet (those land with CAL-02, mirroring GRO-01→GRO-02).

- **`cal_events`** — a STAFF-OWNED table (clients have no calendar access — matrix):
  `ownerUserId` (the own-scope key), optional `clientId` (context — a denormalized
  reporting link, NOT a client-rep scope key), `title`, `description`, `location`,
  `startAt`/`endAt` (timestamps, stored UTC — Hijri is a render concern), `allDay`
  (default false); indexed on ownerUserId, startAt, clientId.
- **`CalendarService`** — `create` / `list({ownerUserId?, from?, to?})` (date-range
  by overlap: `startAt ≤ to AND endAt ≥ from`) / `getById` / `update` / `remove`,
  each mutation audited in the same transaction (`resource: 'calendar-event'`,
  scoped to the event's optional clientId context when set).
- **Module** `modules/calendar/` registered in `AppModule`.
- **Seed** — 2 events (an interview owned by the recruiter, a Muqeem visit owned by
  the GRO officer).

## Staff-owned scoping (like task_tasks)

Clients get NOTHING — `app_client` is not granted, and there is no client RLS
policy. `app_staff` has full CRUD under `staff_full_access` (defence-in-depth).

```
 rls = t

  grantee  |             privs
-----------+--------------------------------
 app_staff | DELETE, INSERT, SELECT, UPDATE
(no app_client grant, no client_isolation policy)
```

## DoD check

| DoD item | Result |
|---|---|
| Migration applies + `db:generate` (delegate exists) | ✅ `migrate deploy` + `generate` clean; `owner.calendarEvent` used in tests |
| `app_staff` full CRUD, NO `app_client` grant, RLS on | ✅ psql output above |
| create/update audited in one tx (`resource: 'calendar-event'`) | ✅ tests 1, 4 |
| list filters by owner + date-range overlap | ✅ tests 2, 3 |
| allDay defaults false; remove works, missing → null | ✅ tests 1, 5 |
| Seed inserts events; suite + lint + typecheck + build green | ✅ "…; 2 calendar events; …"; suite **288/288** |

## Test output (`test/calendar-events.e2e-spec.ts`, 5/5)

```
✓ creates an event and audits it in the same transaction
✓ lists events filtered by owner
✓ lists events overlapping a date range
✓ updates an event and audits the before/after
✓ removes an event; a missing id returns null
```

Full suite **56 files / 288 passed** (was 283 + 5 new).

## Files

- `apps/api/prisma/schema.prisma` (CalendarEvent)
- `apps/api/prisma/migrations/20260724183244_calendar_events/migration.sql`
- `apps/api/src/modules/calendar/{calendar.module.ts, public-api.ts, application/calendar.service.ts, domain/calendar-event.ts}`
- `apps/api/src/app.module.ts` (register CalendarModule)
- `apps/api/prisma/seed.ts` (seedCalendarEvents)
- `apps/api/test/calendar-events.e2e-spec.ts`

## Next (CAL-02)

Calendar HTTP API — own-scoped event CRUD (`calendar.read`/`create`/`update`/
`delete` + `calendar.read-all` lift) + a **calendar-view** endpoint that merges own
events with Tasks/Requests/GRO **deadlines** for a date range; isolation +
audited-writes registration.
