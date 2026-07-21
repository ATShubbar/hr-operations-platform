# AUTH-08 — Session identity endpoint + role-aware UI — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUTH-08 (fast-follow flagged in AUDIT-05/CLIENT-04)
- Status: done
- Commit: `AUTH-08: /auth/me + role-aware UI + route guard`

## What shipped

- **`GET /auth/me`** — the current authenticated actor `{userId, principalType,
  role, clientId, permissions}`. `@Public` to the guard but self-checks the
  session (401 unless the middleware resolved a FULL session), mirroring the MFA
  endpoints. `permissions` comes from `PolicyService.permissionsFor(role)`.
- **Web `SessionProvider`** (`lib/session.tsx`) — resolves `/auth/me` once,
  **redirects to `/login` on failure**, and renders children only when a
  session exists. This is the client-side **route guard** for the whole
  authenticated area. `useCan(permission)` reads the capability list.
- **Role-aware app shell** (`app-shell.tsx`) — nav links appear only for held
  capabilities (Clients ← `client.read`, Audit log ← `audit.read`).
- **Role-aware clients page** — New/Edit/Archive (and the Actions column) render
  only with `client.create/update/delete`.
- **Capability-aware post-login landing** — admins → `/audit`, other staff →
  `/clients` (no more landing on a section you can't read).
- `@hr/contracts` `meResponseSchema`; `GET /auth/me` registered `session` in the
  isolation harness.

## DoD check

| DoD item | Result |
|---|---|
| `/auth/me` returns actor + capabilities; 401 unauth | ✅ 4 e2e |
| Capabilities correct per role | ✅ hr_officer has `client.read` not `audit.read`/`client.create`; admin has all; rep has `client-user.create` not `client.create` |
| Route guard (no session → login) | ✅ SessionProvider redirects on `/auth/me` failure |
| Role-aware nav | ✅ hr_officer sees only Clients (Audit log hidden) |
| Role-aware clients page | ✅ hr_officer: no New/Edit/Archive, no Actions column, list read-only |
| Capability-aware landing | ✅ hr_officer login → `/clients` (not `/audit`) |
| `lint typecheck test build` green | ✅ turbo 15/15; API **97/97** (+4) |

## Verification

- **API (`test/auth-me.e2e-spec.ts`, 4/4):** unauth → 401; hr_officer,
  company_admin (enrolled), and client_admin each return the right identity +
  capability set.
- **Browser (hr_officer — not MFA-required):** logged in → **landed on
  `/clients`**; nav shows **only Clients**; the clients table has **Name/Status
  only** (no Actions), **no New/Edit/Archive** buttons — a clean read-only view
  (screenshot). (Admin's full-action view was verified in CLIENT-04.)

## Design decisions recorded

- **Capability-based UI, not role-name checks.** The UI gates on permissions
  (`useCan('client.create')`), matching the architecture's "no role conditionals"
  ethos — the server remains the source of truth (the guard still enforces).
- **`/auth/me` is `@Public` + self-checking** rather than adding a new
  "authenticated-only" guard mode — consistent with the existing MFA endpoints.

## Landmine recorded (CLAUDE.md)

- Running `next build` (production) while the web **dev/preview server is
  running** clobbers `.next`; the dev server then throws
  `Cannot find module './NNN.js'`. Stop the dev server first, or verify only via
  the dev server. (Hit during this task; not a code bug.)

## Deferred (stated)

- Server-side route protection (middleware) still absent — the guard is
  client-side (SessionProvider). Good enough with httpOnly sessions; a Next
  middleware check is a further hardening.
- Client-rep landing: reps have no UI destination yet (client portal is
  Priority 5); they currently fall through to `/clients` (403). No regression —
  there was no rep UI before.
