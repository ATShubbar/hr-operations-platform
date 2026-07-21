# AUDIT-02 — Client-rep audit write path (grant + RLS) — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUDIT-02 (ACTION-PLAN 2.3)
- Status: done
- Commit: `AUDIT-02: client-rep audit write path (app_client INSERT + RLS)`

## What shipped

Two raw-SQL migrations (the second is a non-destructive follow-up — see
"Landmine" below; applied migrations are never edited):

- `20260721160440_audit_client_write_grant` — `GRANT INSERT ON aud_entries TO
  app_client`; `ENABLE ROW LEVEL SECURITY`; `staff_full_access` (ALL / app_staff,
  permissive) + `client_insert` (INSERT / app_client, `WITH CHECK client_id =
  NULLIF(current_setting('app.client_id', true), '')::uuid`).
- `20260721160826_audit_client_seq_grant` — `GRANT USAGE ON SEQUENCE
  aud_entries_id_seq TO app_client` (BIGSERIAL `nextval` needs it).

## DoD check

| DoD item | Result |
|---|---|
| Migration applies to fresh DB | ✅ both applied via `migrate deploy` |
| app_client INSERT own client_id (in set_config tx) succeeds | ✅ 1 row inserted, visible to owner |
| app_client INSERT other client_id → RLS rejects | ✅ `new row violates row-level security policy` |
| app_client SELECT denied | ✅ `permission denied` (no SELECT grant) |
| app_client UPDATE/DELETE denied | ✅ `permission denied` (no grant) |
| app_staff unaffected (reads all + inserts) | ✅ AUDIT-01 suite green; staff reads across clients under permissive policy |
| `lint typecheck test build` green | ✅ turbo 15/15; 56/56 tests (13 files, +6 audit-client-write) |
| Endpoint registry untouched | ✅ no endpoints (DB-capability task) |

## Grant + RLS matrix on `aud_entries` (DB-verified)

```
  grantee   |                     table_privs
------------+---------------------------------------------------------------
 app_client | INSERT
 app_staff  | INSERT, SELECT
 hr         | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE   (owner; migrations only)

 sequence aud_entries_id_seq: app_client=USAGE, app_staff=USAGE, hr=USAGE

      polname      | polcmd |    roles
-------------------+--------+--------------
 client_insert     |   a    | {app_client}   (a = INSERT-only, WITH CHECK own-client)
 staff_full_access |   *    | {app_staff}    (* = ALL, permissive backstop)
```

- **app_client**: INSERT only, RLS-constrained to its own `client_id`. No read,
  update, or delete. Cannot fabricate another client's audit rows.
- **app_staff**: unchanged behavior — SELECT + INSERT across all clients
  (permissive staff policy); no UPDATE/DELETE (append-only holds).
- **hr** (owner): full, but migrations-only; no runtime path connects as owner.

## Test output (`test/audit-client-write.e2e-spec.ts`, 6/6)

```
✓ app_client INSERTs an audit row for its OWN client
✓ app_client CANNOT INSERT an audit row for a DIFFERENT client (RLS WITH CHECK)
✓ app_client CANNOT read audit rows (no SELECT grant)
✓ app_client CANNOT UPDATE or DELETE audit rows (no grant)
✓ FINDING: app_client INSERT ... RETURNING is denied (RETURNING needs SELECT)
✓ app_staff is UNAFFECTED: still reads all + inserts (permissive staff policy)
```

AUDIT-01 suite re-run green (RLS enable did not regress staff read/write).
Full pipeline: `pnpm turbo run lint typecheck test build` → **15/15**, **56/56 tests**.

## Findings recorded (verified empirically, not assumed)

- **`RETURNING` requires `SELECT`.** `INSERT … RETURNING id` as `app_client`
  fails `permission denied` — because RETURNING reads the returned columns and
  `app_client` has no SELECT grant. **Consequence for AUDIT-03:** the client-rep
  audit write must use a raw `INSERT` **without** `RETURNING` (INSERT-only
  privilege). Proven by the `FINDING:` test above.
- **RLS is evaluated AFTER column/sequence privileges.** The first cut of this
  task granted table INSERT but not sequence USAGE; the INSERT failed at
  `nextval` with `permission denied for sequence` *before* the RLS `WITH CHECK`
  ran. The test caught it; fixed by the seq-grant migration.

## Landmine hit (CLAUDE.md class of knowledge)

- **`prisma migrate reset` is blocked for AI agents** (destructive-action
  guard) and requires explicit user consent. Correct fix here was
  non-destructive: revert the (unpushed) applied migration to its exact bytes
  so its checksum still matches, then add a **new additive migration** for the
  sequence grant. Never edit an already-applied migration.
