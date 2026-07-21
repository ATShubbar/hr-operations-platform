# AUTH-07 — Role/user seeding + harness update — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUTH-07
- Status: done
- Commit: `AUTH-07: seed all role users; expose role constants`

## DoD check

| DoD item | Result |
|---|---|
| Seed adds one staff user per role + one client-rep per seeded client | ✅ 9 users: 7 staff roles + client_admin@A + client_user@B |
| Seed idempotent (fresh + re-seed, no dupes) | ✅ ran twice → identical output; DB holds exactly 9 rows, 9 distinct roles |
| Harness asserts staff endpoints → 401 unauthenticated; green | ✅ isolation harness 7/7, incl. "staff-scoped endpoints reject unauthenticated requests (401)" |
| Deliberate regression turns harness red (then reverted) | ✅ mis-registered `GET /health` as `staff` → staff→401 test failed; reverted, back to 7/7 |
| `lint typecheck test build` green | ✅ turbo 15/15 successful; 47/47 tests |
| Production guard on seed | ✅ `NODE_ENV=production` refuses to seed (unchanged from WS-19) |

## Commands + output

Seed run twice (idempotency):

```
=== SEED RUN 1 ===
Seed complete: 3 scope-check rows across clients A (1111…) and B (2222…);
  9 auth users (7 staff roles + 2 client reps, 9/9 distinct roles covered).
=== SEED RUN 2 (idempotency) ===
Seed complete: 3 scope-check rows across clients A (1111…) and B (2222…);
  9 auth users (7 staff roles + 2 client reps, 9/9 distinct roles covered).
```

DB state after two runs (no duplicates):

```
 principal_type |     role      |              client_id               | status | mfa_enrolled
----------------+---------------+--------------------------------------+--------+--------------
 staff          | system_admin  |                                      | active | f
 staff          | company_admin |                                      | active | f
 staff          | recruiter     |                                      | active | f
 staff          | hr_officer    |                                      | active | f
 staff          | gro_officer   |                                      | active | f
 staff          | finance       |                                      | active | f
 staff          | read_only     |                                      | active | f
 client_rep     | client_admin  | 1111…                                | active | f
 client_rep     | client_user   | 2222…                                | active | f
(9 rows)
 total | distinct_roles
-------+----------------
     9 |              9
```

Harness green (7/7) with the staff→401 assertion:

```
✓ staff-scoped endpoints reject unauthenticated requests (401)
Test Files  1 passed (1)   Tests  7 passed (7)
```

Red-path (deliberate regression — `GET /health` re-registered as `staff`):

```
× staff-scoped endpoints reject unauthenticated requests (401)
  (health returns 200 unauthenticated → expect(401) fails)
Tests  1 failed | 6 passed (7)
```

Full pipeline: `pnpm turbo run lint typecheck test build` → **15 successful, 15 total**; `@hr/api:test` **47 passed (47)**.

## Design decisions recorded

- **Seeded principals live under `@seed.hr.local`.** Cleanup deletes exactly
  that domain, so the seed never collides with the harness's own
  `e2e-helper-` users (which it creates and cleans independently). The two
  fixture sets coexist; the harness stays hermetic and does NOT depend on
  seed state.
- **Client-rep assignment covers both client roles across the two clients**
  (A → `client_admin`, B → `client_user`) while keeping "one client-rep per
  client." All 9 architecture roles are represented exactly once.
- **Admins are seeded WITHOUT an `mfa_secret`** — they log in to an
  enroll-required session until they enroll, exactly as AUTH-06 requires. The
  seed never fabricates enrollment; `mfa_enrolled = f` for all rows is the
  honest, correct state.
- **Role constants (`STAFF_ROLES`, `CLIENT_ROLES`) exported from the auth
  `public-api`** so the seed derives its user set from the single source of
  truth (`domain/permissions.ts`) instead of duplicating the role list.
- **The harness's staff→401 coverage predates this task** (built in AUTH-03
  when the harness moved to real sessions). AUTH-07 verifies it green and
  proves its red-path; no new assertion was needed, so none was invented.

## Notes

- Seed hashes via the auth module's `PasswordService` (`new PasswordService()`
  outside DI — no constructor deps), keeping argon2id params identical to the
  login path. Shared dev password `Seed-dev-password-1`; dev-only behind the
  production guard.
- Boundary lint stays green: the seed imports only from `auth/public-api`,
  the sanctioned entry point (same path the login test helper uses).
