# GCAL-02 — Persist + HTTP: Google Calendar invitations API — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → GCAL-02 (ACTION-PLAN 5.3, ADR-009)
- Status: done
- Commit: `GCAL-02: Google Calendar invitations API — persisted, audited outbound over the adapter`

## What shipped

The persisted, audited HTTP surface over the GCAL-01 adapter — staff schedule outbound
invitations; the record stores the external Google id + **exactly the whitelisted
payload that left**.

- **`int_gcal_invitations`** — a STAFF-OWNED table (integration data; clients have no
  access, so like task_tasks `app_client` is granted nothing): externalEventId,
  referenceCode, kind, status (scheduled/cancelled), start/end (UTC), timezone,
  **`payload` (JsonB — the whitelisted GoogleEventPayload that was sent)**, clientId?,
  createdByUserId.
- **`GcalInvitationsService`** — SEND via the adapter first (get external id + the
  payload it built), then persist + audit (`resource: 'gcal-invitation'`). The stored
  payload is the **adapter's**, never rebuilt here, so the service can't widen what
  leaves. (The adapter now returns the payload it sent — the sole builder.)
- **API** (all `integration.google-calendar`, staff-only):

| Route | Notes |
|---|---|
| `POST /integrations/google-calendar/invitations` | typed whitelisted contract → adapter → persist |
| `GET …/invitations` · `GET …/:id` | list / read (payload surfaced for inspection) |
| `PATCH …/:id` | re-send the rebuilt invitation to the external id |
| `DELETE …/:id` | cancel the Google event + mark the record cancelled (kept for audit) |

- **`integration.google-calendar`** granted to the staff who schedule: Company Admin,
  Recruiter, HR Officer, GRO Officer (Finance/Read-Only/System-Admin/clients excluded).

## DoD check

| DoD item | Result |
|---|---|
| Recruiter schedules → sent via adapter (captured) + persisted; response surfaces the whitelisted payload (keys = whitelist only) | ✅ test 1 |
| List / read | ✅ test 2 |
| Update re-sends to the external id | ✅ test 3 |
| Cancel cancels the Google event + marks the record cancelled | ✅ test 4 |
| Typed contract validates (bad email → 400) | ✅ test 5 |
| Finance lacks the permission (403); client rep → 403; unauth → 401 | ✅ tests 6, 7 |
| Every mutation audited; 3 writes declared; write-coverage green | ✅ write-coverage 3/3 |
| Isolation (5 staff routes) + permission-catalog coverage green | ✅ isolation 10/10; authz 4/4 |
| `app_staff`-only grant, no `app_client` | ✅ psql: `app_staff | DELETE, INSERT, SELECT, UPDATE` |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **312/312** |

## Test output (`test/gcal-invitations-api.e2e-spec.ts`, 7/7)

```
✓ a recruiter schedules an invitation — sent via the adapter + persisted with the whitelisted payload
✓ lists invitations
✓ updates an invitation — re-sends to the adapter with the external id
✓ cancels an invitation — cancels the Google event and marks it cancelled
✓ validates the whitelisted contract (bad email → 400)
✓ Finance staff lack the permission (403)
✓ a client rep has no access (403); unauth → 401
```

Full suite **60 files / 312 passed** (was 305 + 7 new).

## Files

- `apps/api/prisma/schema.prisma` (GcalInvitation + enums) + migration `20260725085336_gcal_invitations` (staff-only grant + RLS)
- `packages/contracts/src/integration.ts` (+ index)
- `apps/api/src/modules/integrations/api/gcal-invitations.controller.ts` (NEW)
- `apps/api/src/modules/integrations/application/gcal-invitations.service.ts` (NEW)
- `apps/api/src/modules/integrations/application/google-calendar.adapter.ts` (returns the sent payload)
- `apps/api/src/modules/integrations/integrations.module.ts` (+ AuditModule, service, controller)
- `apps/api/src/modules/auth/domain/permissions.ts` (`integration.google-calendar` + grants)
- `apps/api/test/isolation/endpoint-registry.ts` (5 routes) · `test/audit/audited-writes.ts` (3 writes)
- `apps/api/test/gcal-invitations-api.e2e-spec.ts` (NEW)

## Next (GCAL-03)

Web UI — a "Google invitations" screen: schedule an invitation (typed form) + a list
that shows exactly the whitelisted payload that would leave the system (the dev-capture
transparency view).
