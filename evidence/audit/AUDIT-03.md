# AUDIT-03 — Automatic mutation logging (write path) — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUDIT-03 (ACTION-PLAN 2.3)
- Status: done
- Commit: `AUDIT-03: mutation logging on a write path + write-audit coverage`

## Mechanism decision

Owner deferred to recommendation → **explicit audit at the write site,
enforced by a CI coverage test**. Each mutation writes its `AuditService.
record()` in the SAME transaction as the row; a coverage spec fails CI if any
mutating route is neither declared audited nor explicitly exempt. This gives
the architecture's "every mutation logged" guarantee via CI (the same
registry-enforced idiom as the permission catalog and isolation harness),
without the transaction-composition risk of interception — and keeps
before/after precise and debuggable.

## What shipped

- `ScopedPrismaService.transaction(clientId, fn)` — an interactive
  client-scoped transaction: sets the transaction-local `app.client_id`, then
  runs the callback, so a mutation and its audit commit/roll back together
  under RLS (the per-op `forClient()` wrapper can't span statements).
- `AuditService.record()` unified on a raw `INSERT` **without `RETURNING`** —
  works for both the staff and client-rep DB roles (RETURNING needs SELECT,
  which app_client lacks — AUDIT-02 finding).
- `POST /scope-check` — the first write path: creates a `core_scope_check`
  row and its audit entry in one scoped transaction. New permission
  `scope-check.create` (client roles).
- Isolation harness: new `client-write` scope class; `POST /scope-check`
  registered and probed for unauthenticated → 401.
- `test/audit/audited-writes.ts` + `write-coverage.e2e-spec.ts` — the
  can't-forget guarantee: every mutating route classified audited-or-exempt.

## DoD check

| DoD item | Result |
|---|---|
| Mutation + audit written in one transaction, proven on a write path | ✅ `POST /scope-check`: row + exactly one audit entry, same tx |
| Audit entry scoped to the caller (actor/client/before-after) | ✅ `clientId`, `actorId`, `actorRole`, `after.note`, `requestId` all correct |
| Atomic rollback — no orphan row or audit | ✅ forced failure rolls BOTH back |
| Cross-client write barred (RLS backstop) | ✅ scoped tx writing another client's row → `row-level security` violation |
| Can't-forget guarantee enforced in CI | ✅ undeclared mutating route → coverage RED (proven, reverted) |
| Isolation harness green incl. new endpoint | ✅ `client-write` → 401; COVERAGE green |
| Suite + lint green | ✅ turbo 15/15; **63/63 tests** (15 files, +7) |

## Test output

```
test/audit/audit-mutation.e2e-spec.ts (AUDIT-03)
  ✓ POST /scope-check writes the row AND exactly one audit entry, scoped to the caller
  ✓ scoped transaction is atomic: a failure rolls BOTH the row and its audit back
  ✓ RLS backstop: a scoped transaction cannot write another client’s row
test/audit/write-coverage.e2e-spec.ts (AUDIT-03)
  ✓ COVERAGE: every mutating route is classified; no stale or double entries
  ✓ audited routes name a resource.action
  ✓ exemptions carry a stated reason
test/isolation/isolation.e2e-spec.ts
  ✓ client-write endpoints reject unauthenticated requests (401)
```

Red-path (can't-forget) — `POST /scope-check` removed from `AUDITED_WRITES`:

```
× COVERAGE: every mutating route is classified; no stale or double entries
  → Mutating routes not declared in audited-writes.ts: POST /scope-check
Tests  1 failed | 2 passed (3)
```

Reverted → 3 passed. Full pipeline: `pnpm turbo run lint typecheck test build`
→ **15/15**, **63/63 tests**. AUDIT-01/02 stayed green (unified `record()`
did not regress them).

## Design decisions recorded

- **Business-data audit vs auth-event audit.** This registry covers
  business/domain mutations. Auth/session/MFA routes (login, logout, the MFA
  steps) are exempt HERE with a stated reason — a security-event stream is a
  separate future concern, not silently uncovered. `POST /auth/mfa/verify`
  does persist `mfa_secret` to `auth_users`; it is explicitly noted as a
  security event out of scope for business-data audit.
- **Structural coverage + per-endpoint runtime proof.** The coverage spec
  guarantees every write is *declared* audited; actual runtime auditing is
  proven per endpoint (the scope-check e2e here). Future modules add their
  route to `audited-writes.ts` and their own audit e2e — the module README
  checklist (item 5) now states this.
- **`before/after` redaction** (salary, gov data) is still pending — flagged
  for the first module that writes sensitive fields; the read path is already
  SysAdmin/CompanyAdmin-only.

## Notes

- Client-rep write uses `ScopedPrismaService.transaction()`; the mutation on
  `core_scope_check` can use Prisma `.create()` (app_client HAS SELECT there,
  so RETURNING is fine) — only the audit INSERT avoids RETURNING.
