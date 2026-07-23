# REQ-02 — Requests HTTP API (dual-path: staff + client-rep) — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → REQ-02 (ACTION-PLAN 4.3)
- Status: done
- Commit: `REQ-02: Requests HTTP API — dual-path (staff + client-rep, RLS-scoped)`

## What shipped

The Requests API — and the platform's **first dual-path resource**: consultancy
staff manage requests across all clients; client reps create/read/update ONLY
their own client's requests, RLS-enforced. This is the first end-to-end run of
the client-representative write path in production shape.

- **`RequestsController`** — `POST /requests` (`request.create`), `GET /requests`
  (`request.read`), `GET /requests/:id` (`request.read`), `PATCH /requests/:id`
  (`request.update`). The path is chosen by **principal**: a `client_rep` with a
  context `clientId` → the scoped path (`clientId` ALWAYS from the session, body
  value ignored); staff → the cross-client path (`clientId` from body, validated
  via `ClientsService`).
- **`RequestsService`** dual paths, both owned in the module: staff
  `create/list/find/update` (`PrismaService`) + client-rep
  `createForClient/listForClient/findForClient/updateForClient`
  (`ScopedPrismaService` — transaction-local scope + RLS `WITH CHECK`), each
  mutation audited in the same transaction.
- **Permissions** (matrix): `request.read` → all staff + both client roles;
  `request.create` → company_admin + both client roles; `request.update` →
  company_admin + client_admin (**client_user is create+read only**). Status
  changes are `request.process` (REQ-03), not `PATCH`.

## Design decisions recorded

- **`clientId` for reps is always from context, never input** — the one rule that
  keeps isolation intact. A rep POSTing another client's id still writes to their
  own client (proven below).
- **`PATCH` edits fields only** (title/description/priority/due_date) — advancing
  status is a separate capability (`request.process`, REQ-03).
- **Reads scoped by RLS** — a foreign request id resolves to `null` on the scoped
  path → 404, leaking no existence.
- **Isolation classes** — reads `client-read`, writes `client-write`; own-client
  scoping is proven per-endpoint here (the harness only checks 401-on-unauth).

## DoD check

| DoD item | Result |
|---|---|
| Staff create for any client (validated, unknown → 404); rep create for own client (body ignored) | ✅ tests 1–2 |
| GET / GET :id: staff cross-client (+ filter); rep own-only (foreign id → 404) | ✅ tests 3–5 |
| PATCH fields only; client_admin own, staff any, **client_user → 403**; cross-client → 404 | ✅ tests 6–7 |
| Unauthenticated → 401 | ✅ test 8 |
| Isolation + audited-writes + catalog coverage green | ✅ 4 routes registered; POST/PATCH audited; 3 new perms |
| Suite + lint + typecheck + build green | ✅ suite **205/205**; lint/typecheck/build clean |

## Test output (`test/requests-api.e2e-spec.ts`, 8/8)

```
✓ client rep creates a request in their OWN client (body clientId is ignored)
✓ staff creates a request for an explicit client; unknown client → 404
✓ a client rep lists ONLY their own client’s requests
✓ a client rep cannot GET another client’s request (404) but can GET own
✓ staff read cross-client and can filter by client
✓ client_admin updates own request; client_user cannot (403); cross-client → 404
✓ staff update any request
✓ rejects unauthenticated callers (401)
```

Two fresh clients + reps (client_admin/client_user of A, client_admin of B) + an
enrolled company_admin + an hr_officer reader drive the matrix. Full suite
**40 files / 205 passed**; lint + typecheck + build clean.

## Deferred (to later REQ/TASK cards)

- **REQ-03** — processing + SLA: `request.process` (staff advances status through
  the workflow, assignee), notify on status change; `request.delete` (archive).
- **REQ-04** — Requests web UI (staff console; client view lands with Portal 5.1).
- **TASK-01..04** — the Tasks module; TASK-03 wires Requests → Tasks via a domain
  event (second ADR-004 consumer).
