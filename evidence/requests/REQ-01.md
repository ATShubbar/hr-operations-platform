# REQ-01 — Requests foundation (`req_requests` + RequestsService) — Evidence

- Date: 2026-07-23
- Task card: `BACKLOG.md` → REQ-01 (ACTION-PLAN 4.3)
- Status: done
- Commit: `REQ-01: req_requests client-scoped table + RequestsService (staff path) + seed`

## What shipped

The Requests foundation — a client-scoped registry for client-facing workflow
requests, mirroring the EMP-01/DOC-01 pattern (domain + table + service + seed;
HTTP lands in REQ-02).

- **`req_requests`** (REQ-01 migration) — client-scoped (`client_id`), the
  **FIRST table clients write**: `app_client` granted **SELECT / INSERT / UPDATE**
  (matrix — Client Admin CRU own, Client User CR own) but **not DELETE** (staff
  archive only); RLS `staff_full_access` + `client_isolation` **FOR ALL** so the
  `WITH CHECK` bars cross-client writes, load-bearing NULLIF (SPIKE-001). Enums:
  `RequestType` (letter / certificate / document / gro_service / general),
  `RequestStatus` (open / in_progress / resolved / closed / cancelled, default
  `open`), `RequestPriority` (low / normal / high, default normal). Columns:
  `title`/`description` (user-entered free text, not system ar/en), `due_date`
  (SLA), `created_by_user_id`. Indexed on client_id / status / due_date.
- **`RequestsService`** (staff path) — `create` (audited in a transaction,
  action `request.create`, scoped to the request's client), `list`/`listByClient`,
  `findById`. A new request always starts `open` (advancing it is REQ-03).
- **Seed** — three example requests attributed to the seeded client reps
  (client A's admin, client B's user).

## Design decisions recorded

- **First client-writable table** — the `app_client` INSERT/UPDATE grant + the
  RLS `client_isolation` `WITH CHECK` are what enforce own-client on writes
  (proven per-endpoint in REQ-02, not here). DELETE withheld from clients.
- **User-entered text, not bilingual** — `title`/`description` are free text in
  the author's language (the employee/document pattern), not platform-authored
  ar/en (which is only for system content like notifications).
- **Foundation only** — no HTTP → nothing for the isolation harness until REQ-02
  (mirrors EMP-01/DOC-01/EXP-01). Audit snapshot carries the full request
  metadata (type/title/status/priority/dueDate) — no salary/govdata-style
  sensitivity here.

## DoD check

| DoD item | Result |
|---|---|
| `req_requests` client-scoped, grants (client SELECT/INSERT/UPDATE) + RLS both policies | ✅ migration |
| Enums (type/status/priority) in place, sensible defaults | ✅ open / normal defaults asserted |
| `RequestsService` create (audited, tx) / list / find | ✅ test 1/2 |
| Seed adds example requests; migration applied + `db:generate` | ✅ seed → "3 requests" |
| `test/requests.e2e-spec.ts` green; lint/typecheck/test/build green | ✅ suite **197/197** exit 0 |

## Test output (`test/requests.e2e-spec.ts`, 2/2)

```
✓ creates a request with defaults (open / normal) and writes an audit entry
✓ lists by client and finds by id (honoring explicit fields)
```

Seed run: `Seed complete: 2 client companies; 3 employees; 3 documents; 3 requests; …`.
Full suite **39 files / 197 passed, exit 0**; lint + typecheck + build clean.

## Deferred (to later REQ/TASK cards)

- **REQ-02** — HTTP API: staff + **client-rep** create/read/list/update (the first
  real client-facing write path over `ScopedPrismaService`), `request.create`/
  `request.read`, isolation harness + audited-writes.
- **REQ-03** — processing + SLA: `request.process` (staff status workflow,
  assignee), notify on status change.
- **REQ-04** — Requests web UI.
- **TASK-01..04** — the Tasks module; TASK-03 wires Requests → Tasks via a domain
  event (second ADR-004 consumer).
