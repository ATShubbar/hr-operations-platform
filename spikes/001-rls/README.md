# SPIKE-001 results — RLS + Prisma 7 + pooling

**Executed:** 2026-07-18 · **Verdict: Pattern A VALIDATED — ADR-001 Accepted**
**This package is throwaway by contract.** Nothing imports from it; the production port is WS-13.

## Success criteria

| # | Criterion | Result |
|---|---|---|
| S1 | Omitted `where client_id` returns 0 foreign rows | ✅ scenarios 2, 3 |
| S2 | Missing scope → 0 rows on every table, never errors open | ✅ scenario 5 (after NULLIF fix — see findings) |
| S3 | Zero bleed under pooled concurrency | ✅ scenario 7 (40 ops, pool=2), scenario 8 (rollback residue), soak 3×1,000 requests / 60,000 rows / **0 bleed** |
| S4 | p95 overhead ≤ 15% or ≤ 5ms absolute | ✅ **+1.16ms p95 absolute** (baseline p95 0.46ms → scoped 1.63ms; relative % meaningless at sub-ms localhost baselines) |
| S5 | Roles + policies managed via `prisma migrate` | ✅ 3 migrations incl. hand-written SQL, applied via `migrate deploy` |
| S6 | Writes can't cross scope (`WITH CHECK`) | ✅ scenarios 4, 4b |
| S7 | No per-call boilerplate for module code | ✅ `scoped(base, clientId).spEmployee.findMany()` — ordinary Prisma calls |

Scenario suite: 10/10 passing (`test/scenarios.test.ts`, `test/soak-bench.test.ts`).

## The validated pattern (for WS-13)

- Two DB roles: `app_staff` (permissive policy; app policy service is the front line) and `app_client` (RLS-enforced).
- Policy template (**the NULLIF is load-bearing** — see finding 1):

```sql
CREATE POLICY client_isolation ON <table>
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
```

- Client side: Prisma 7 driver adapter (`new PrismaPg({ connectionString, max })`) + `$extends` query extension wrapping every operation in a batch transaction whose first statement is `SELECT set_config('app.client_id', $1, TRUE)` — transaction-local, evaporates at commit/rollback.

## Findings (each cost real debugging — read before WS-13)

1. **Empty-string GUC residue.** After any transaction-local `set_config`, pooled-connection reuse leaves the custom GUC readable as `''` (NOT NULL). A bare `current_setting(...)::uuid` then **throws** on every unscoped query — closed but noisy, and it breaks legitimate zero-row semantics. `NULLIF(current_setting(...), '')::uuid` maps both unset states to NULL → clean fail-closed. Applied in migration `fix_policy_nullif`.
2. **Transaction `maxWait` must be sized for burst depth.** Default 2s times out when concurrent tx-wrapped ops exceed pool capacity (40 ops on pool=2). Set `transactionOptions: { maxWait, timeout }` on the client; production sizing belongs with pool sizing in WS-13.
3. **`pg_sleep` via `$queryRaw` needs a cast** (`::text`) — void columns don't deserialize. Test-only nuisance.
4. **No external pooler needed at launch.** The Prisma 7 pg driver adapter gives us an in-process `pg.Pool` we configure directly (`max`). pgBouncer questions from the spike doc dissolve: no separate pooler process exists to break session semantics. Revisit only if/when multiple API instances × pool size approach Postgres `max_connections`.

## Benchmark detail (local Docker Postgres 16, M-series)

```
baseline (staff, no tx wrap): p50=0.33ms  p95=0.46ms  mean=0.36ms
scoped (tx-wrapped):          p50=1.23ms  p95=1.63ms  mean=1.29ms
overhead:                     p95 +1.16ms
```

Re-run on KSA-provider infrastructure at WS-20 to confirm S4 there (expected to remain ~1 extra round-trip).
