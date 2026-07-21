# CLIENT-03 — Client portal user management — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → CLIENT-03 (ACTION-PLAN 2.5)
- Status: done
- Commit: `CLIENT-03: client portal user management (Client Admin)`

## What shipped

- `ClientUsersController` (`/client-users`) — a **Client Admin** manages the
  `client_rep` users of **its own client**:
  - `POST /client-users` (`client-user.create`) — invite (create a client_rep
    user in the caller's client), 201.
  - `GET /client-users` / `GET /client-users/:id` (`client-user.read`) — scoped
    to the caller's client.
  - `PATCH /client-users/:id` (`client-user.update`) — role and/or status.
  - `DELETE /client-users/:id` (`client-user.delete`) — **soft-deactivate**
    (status→disabled); identity is never hard-deleted.
- `UsersService` extended (auth module owns `auth_users`): `listClientReps`,
  `findClientRep`, `updateClientRep` — all **scoped to a clientId** — plus a
  tx-aware `createClientRepUser`. `ClientUsersService` (clients module) drives
  these + writes audit in one transaction (AUDIT-03).
- Permissions per the matrix: **Client Admin only** holds `client-user.*`;
  Client User has none.
- `@hr/contracts` client-user request/response schemas (no password/mfa exposed).
- Isolation harness: new `client-read` scope class; `/client-users` routes
  registered; 3 mutations in the write-audit registry.

## DoD check

| DoD item | Result |
|---|---|
| Client Admin invites a client user | ✅ 201; safe response (no password/hash/mfa) |
| List/get scoped to own client | ✅ own users only |
| Cross-client isolation | ✅ another client's user → 404 on get/update/delete; not in list; untouched |
| Update role/status; soft-deactivate | ✅ promote to client_admin; DELETE → disabled, row kept |
| Permission matrix | ✅ plain Client User → 403; staff → 403; unauth → 401 |
| Duplicate email rejected | ✅ 400 |
| Mutations audited (create/update/deactivate), scoped | ✅ actor = client_admin, clientId = own client |
| Coverage gates green | ✅ isolation (client-read + 5 routes), catalog (`client-user.*`), write-audit (3) |
| `lint typecheck test build` green | ✅ turbo 15/15; API **93/93** (+10) |

## Test output (`test/client-users.e2e-spec.ts`, 9/9)

```
✓ unauthenticated → 401
✓ Client Admin invites a client user → 201, safe response shape
✓ list + get are scoped to the admin’s own client
✓ ISOLATION: a Client Admin cannot see or touch another client’s users
✓ update role/status and deactivate (soft)
✓ a plain Client User (no client-user perms) → 403
✓ staff have no client-user permission → 403
✓ duplicate email → 400
✓ mutations are audited (create + update + deactivate), scoped to the client
```

## Design decisions recorded

- **auth_users isolation is application-enforced, not RLS.** `auth_users` is a
  system table (app_staff-only, no RLS — AUTH-01). So every client-user query is
  filtered by the caller's clientId, and that clientId comes ONLY from the
  request context (the client-rep session), **never** from request input. A
  client_id can't be injected to reach another client's users.
- **Cross-client access → 404, not 403.** A Client Admin acting on another
  client's user id gets "not found" — the API never reveals that an id exists in
  a different client.
- **Ownership respected.** The clients module never touches `auth_users`
  directly; it drives auth's `UsersService` (which owns the table), passing a
  transaction handle so the write + its audit stay atomic.
- **Soft-deactivate.** Client users are never hard-deleted — sessions and audit
  history reference them; DELETE sets status=disabled (no-op if already).

## Deferred / scope refinements (stated, not silently dropped)

- **Rep "read own company" moved to the Client Portal epic (ACTION-PLAN 5.1).**
  I earlier said this would sit in CLIENT-03; on implementation it belongs with
  the portal: it needs `GET /clients` to become principal-aware (staff→all,
  rep→own via ScopedPrismaService) and `client.read` granted to reps — a
  delivery-surface concern, cleaner to build with the portal than to bolt onto
  the staff clients API now.
- **Staff read of client-users** (matrix R for System/Company Admin) is not
  granted yet — the endpoint is rep-scoped (derives clientId from context);
  a staff view (with a client filter) is a follow-up.
- **Invite = set-initial-password** for now (the Client Admin sets it). A proper
  invite-token/email flow depends on the Notifications module (Priority 3).
