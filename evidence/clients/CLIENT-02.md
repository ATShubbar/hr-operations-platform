# CLIENT-02 — Client management API (staff) — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → CLIENT-02 (ACTION-PLAN 2.5)
- Status: done
- Commit: `CLIENT-02: staff client management API (audited)`

## What shipped

- `ClientsController` — staff client-company management over `cli_clients`:
  - `GET /clients` (`client.read`) — list all (cross-client, staff).
  - `GET /clients/:id` (`client.read`) — one, 404 if missing.
  - `POST /clients` (`client.create`) — create, 201.
  - `PATCH /clients/:id` (`client.update`) — update name/status.
  - `DELETE /clients/:id` (`client.delete`) — **soft-archive** (status→inactive), never a hard delete (a client is the isolation boundary child data references).
- `ClientsService` mutations refactored: each writes the row **and its audit
  entry in one staff transaction** (AUDIT-03 pattern), scoped to the affected
  client's id, with before/after on updates.
- Permissions per the matrix: **all staff** hold `client.read`; **System/Company
  Admin only** hold `client.create/update/delete` (`ADMIN_STAFF`). Client-rep
  "read own" is deferred (its scoped endpoint lands later).
- `@hr/contracts`: `createClientRequestSchema`, `updateClientRequestSchema`,
  `clientResponseSchema`, `clientListResponseSchema` (bilingual `name {ar,en}`).
- Registered: 5 routes in the isolation harness (`staff`); 3 mutations in the
  write-audit registry (`client.create/update/delete`).

## DoD check

| DoD item | Result |
|---|---|
| Authorization matrix (admin CRUD; staff read-only; rep denied; unauth 401) | ✅ admin 201/200; hr_officer read 200 but create/update/delete 403; client rep 403; unauth 401 |
| CRUD + response shape (bilingual name, timestamps) | ✅ create→get→list; response `{id,name:{ar,en},status,createdAt,updatedAt}` |
| DELETE = soft archive | ✅ status→inactive; row still present |
| Mutations audited (create/update/archive) in one tx, scoped | ✅ audit trail `[create, update, archive]`, actor + `clientId` = the client |
| 404 unknown id; 400 invalid body | ✅ both |
| Coverage gates green | ✅ isolation COVERAGE (5 routes), catalog coverage (`client.*`), write-audit coverage (3 mutations) |
| `lint typecheck test build` green | ✅ turbo 15/15; API **83/83** (+9) |

## Test output (`test/clients-api.e2e-spec.ts`, 9/9)

```
✓ unauthenticated → 401
✓ admin creates a client → 201 with the response shape
✓ get by id and list include the created client
✓ admin updates name and status
✓ DELETE archives (soft): status → inactive
✓ non-admin staff reads (200) but cannot create/update/delete (403)
✓ client rep has no client.read → 403
✓ 404 for unknown id; 400 for invalid body
✓ mutations are audited (create + update + archive), scoped to the client
```

## Design decisions recorded

- **DELETE = soft-archive.** A client company is the isolation boundary that
  employees/documents/etc. reference; hard-deleting it would orphan data. The
  matrix "D" is delete/**archive** — `DELETE` sets `status=inactive` and is a
  no-op (no audit) if already archived.
- **Per-role permissions, not per-endpoint scoping.** All staff read; admins
  mutate — enforced by the deny-by-default guard, no role `if`s in the handler.
  `client.read` is **not** granted to client roles yet: the staff `GET /clients`
  uses the staff Prisma path (all clients), so granting reps `client.read`
  before the scoped rep endpoint exists would leak. The rep "read own" endpoint
  (ScopedPrismaService) + granting reps `client.read` is CLIENT-03/later.
- **Audit scoped to the affected client.** Staff sessions have no client
  binding, so the audit row's `clientId` is set explicitly to the target
  client's id — a client's trail includes changes to its own company record.

## Deferred (stated)

- Client-rep read of its own company (scoped) → CLIENT-03.
- Client portal user management (invites) → CLIENT-03.
- Clients console UI → CLIENT-04.
