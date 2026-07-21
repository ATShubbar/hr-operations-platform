# AUDIT-01 — Audit module + append-only table + transactional write — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUDIT-01 (ACTION-PLAN 2.3)
- Status: done
- Commit: `AUDIT-01: append-only audit table + transactional write API`

## Decision resolved (ADR-004 hardening)

Audit writes are **synchronous and transactional** (Option A, owner-approved):
`AuditService.record(tx, input)` inserts the audit row *inside the caller's
transaction*, so audit and mutation commit-or-rollback together. ADR-004's
transactional outbox + BullMQ remains reserved for cross-module *async* side
effects (e.g. Notifications); audit needs **atomicity**, not deferral, and an
in-transaction write is the stronger guarantee. ADR-004 is `Proposed`, so this
is hardening-on-implementation, not drift.

## DoD check

| DoD item | Result |
|---|---|
| Migration applies to fresh DB | ✅ `20260721154941_audit_entries` applied; client regenerated |
| Grant check: no role holds UPDATE/DELETE | ✅ `app_staff` = INSERT, SELECT only; `app_client` = none; owner `hr` full (migrations only) |
| `record()` writes within a passed transaction; commit atomicity | ✅ mutation + audit row commit together (context-defaulted actor/scope/requestId) |
| Rollback atomicity — no orphan audit | ✅ tx throws after both writes → neither row persists |
| Append-only proven at runtime | ✅ app_staff UPDATE and DELETE both → `permission denied`; row survives |
| `lint typecheck test build` green; boundary lint green | ✅ turbo 15/15; 50/50 tests (12 files, +3 audit) |
| Endpoint registry untouched (no HTTP endpoints yet) | ✅ no controllers in AUDIT-01; read API is AUDIT-03 |

## Grants on `aud_entries` (definitive append-only proof)

```
  grantee  |                          privileges
-----------+---------------------------------------------------------------
 app_staff | INSERT, SELECT
 hr        | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
```

- `app_staff` (runtime staff path): INSERT + SELECT only — **no UPDATE, no DELETE**.
- `app_client` (runtime client-rep path): **not present** — no client role has `audit.read`.
- `hr` (owner): full rights, but used ONLY by migrations/`DATABASE_URL`; no runtime code path connects as owner.

## Test output

```
✓ commits the audit row in the same transaction as the mutation (+ context defaulting)
✓ rolls the audit row back when the caller transaction fails (no orphan audit)
✓ is append-only: app_staff cannot UPDATE or DELETE an audit row
Test Files  1 passed (1)   Tests  3 passed (3)
```

Full pipeline: `pnpm turbo run lint typecheck test build` → **15 successful, 15 total**; `@hr/api:test` **50 passed (50)**.

## Design decisions recorded

- **`aud_entries` is a SYSTEM table, not RLS-scoped-for-read**, exactly like
  `auth_users`: only System/Company Admin hold `audit.read`, no client role
  reads it, so read access is an `app_staff` grant + application policy
  (AUDIT-03), not a client RLS policy. `client_id` is nullable (system actions
  have no client) and is **data for filtering**, not an RLS scope key.
- **Append-only is enforced by the GRANT**, not by triggers or convention:
  the minimal `SELECT, INSERT` grant to `app_staff` means a runtime UPDATE or
  DELETE fails at the database. The owner keeps full rights so migrations can
  still evolve the schema.
- **`record(tx, …)` takes the caller's transaction** and never opens its own —
  the caller composes the mutation and its audit into one atomic unit. Actor,
  role, client scope, and request id **default from the WS-14 request context**
  (`AsyncLocalStorage`); explicit fields are for system-originated writes
  (jobs/seeds) outside a request.
- **`id BIGSERIAL`** for an append-only high-volume log; JSON serialization of
  the bigint id is deferred to the AUDIT-03 read API (no HTTP surface here).

## Scope deferred to AUDIT-02 / AUDIT-03 (stated, not silently dropped)

- **Client-rep write path**: `app_client` INSERT grant + its RLS `WITH CHECK`
  (client-reps may only write audit rows scoped to their own client) lands in
  AUDIT-02, alongside wiring real mutations to `record()` — shipped there so
  it is written with its test, not untested now.
- **`before/after` field redaction** (salary, gov data) and the
  `audit.read`-gated admin read/filter API + UI: AUDIT-02/03/04.

## Landmine hit (CLAUDE.md class of knowledge)

- **`prisma migrate dev` did NOT regenerate the client** here (the `AuditEntry`
  delegate was missing → `owner.auditEntry` undefined at test time). An
  explicit `CHECKPOINT_DISABLE=1 prisma generate` fixed it. Add a `db:generate`
  after `--create-only` + apply, or don't trust migrate-dev's implicit generate
  on this setup.
