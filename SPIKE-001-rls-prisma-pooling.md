# SPIKE-001 — Row-Level Security + Prisma + Connection Pooling

**Status:** Not started
**Timebox:** 4 working days (decision by day 5 regardless of outcome)
**Feeds:** ADR-001 (Data isolation)
**Owner:** TBD

---

## Context

The architecture mandates strict per-client-company isolation enforced **in the database** (PostgreSQL Row-Level Security) as a fail-closed backstop behind application-level scoping. The known risk: RLS depends on per-request session state (`current_setting('app.client_id')`), while Prisma manages its own connection pool — and an external pooler (pgBouncer in transaction mode, or a provider's pooler) recycles connections between requests. Naive `SET` calls leak state across requests; that failure mode is *worse* than no RLS, because it can attach the wrong client's scope to a connection.

This spike proves (or disproves) a safe, performant pattern before any production schema exists.

## Goals

1. Prove that RLS policies enforce client isolation for client-representative sessions **even when the application query omits its `where client_id` clause** (the exact bug RLS exists to catch).
2. Prove the pattern is safe under **pooled, concurrent, mixed-client traffic** — no scope bleed between requests sharing connections.
3. Measure the **performance cost** of the pattern versus baseline Prisma queries.
4. Prove RLS policies and database roles can be **managed through Prisma migrations** (raw SQL migrations), applied by CI.
5. Produce the **production pattern** (code + policy templates) that Phase 1.5 implements directly.

## Questions the spike must answer

- Does `SET LOCAL` / `set_config(..., is_local => true)` inside a Prisma interactive transaction reliably scope settings to that transaction on our chosen provider's pooler?
- Do we need pgBouncer at all at our scale, or is Prisma's internal pool against Postgres sufficient (which simplifies everything)?
- Interactive-transaction-per-request: what does it do to connection hold time and pool sizing under load?
- How do staff sessions (cross-client by permission) coexist with RLS — separate DB role, `BYPASSRLS`, or permissive policies?
- What is the failure behavior when scope is *missing* (unset setting) — does every policy fail closed?

## Recommended approach (to be validated, not assumed)

**Pattern A — transaction-scoped settings via client extension (primary candidate):**

1. Two database roles:
   - `app_staff` — used for consultancy-staff requests; RLS not applied (authorization enforced by the application policy service, which is the primary control for staff).
   - `app_client` — used for client-representative requests; `FORCE ROW LEVEL SECURITY` on all client-scoped tables.
2. RLS policy template (fail-closed by construction — `current_setting` returning NULL makes the predicate false):
   ```sql
   CREATE POLICY client_isolation ON employees
     USING (client_id = current_setting('app.client_id', true)::uuid);
   ALTER TABLE employees FORCE ROW LEVEL SECURITY;
   ```
3. A Prisma **client extension** (`$extends`) that wraps every operation for client-rep requests in an interactive transaction which first executes:
   ```sql
   SELECT set_config('app.client_id', $1, true);  -- true = transaction-local
   ```
   Transaction-local settings evaporate at commit/rollback, so pooled connection reuse cannot leak scope.
4. Request context (from the auth layer) decides which Prisma client instance (role/connection string) serves the request.

**Pattern B — fallback if A fails validation:** dedicated Postgres session per request via a small connection-manager, or provider-specific pooler features (e.g., server-side connection pinning). Only explored if A fails a success criterion.

**Explicitly rejected up front:** non-local `SET` on pooled connections (leak by design); RLS applied to staff sessions as primary authorization (RLS is the backstop; the policy service is the front line).

## Success criteria (all must pass)

| # | Criterion | Measurement |
|---|---|---|
| S1 | **Fail-closed proof:** as `app_client` scoped to Client A, a query for Client B's rows with *no* `where client_id` returns **0 rows** | Automated test |
| S2 | **Missing-scope proof:** as `app_client` with *no* `app.client_id` set, every client-scoped table returns **0 rows** (never errors open) | Automated test |
| S3 | **No bleed under concurrency:** soak test — ≥ 1,000 concurrent mixed-client requests through the pooled setup; **zero** cross-client rows returned across the run | Soak script, repeated 3× |
| S4 | **Performance:** p95 latency overhead of the transaction-wrapped pattern ≤ 15% (or ≤ 5 ms absolute) vs. baseline Prisma on the same queries; pool does not exhaust at 2× expected peak concurrency | Benchmark on KSA-provider-equivalent infra |
| S5 | **Migratable:** roles + policies created and evolved exclusively through `prisma migrate` SQL migrations, applied cleanly to a fresh database by CI | Fresh-DB CI run |
| S6 | **Write safety:** INSERT/UPDATE/DELETE as `app_client` cannot create or modify rows outside its scope (`WITH CHECK` clauses verified) | Automated test |
| S7 | **Ergonomics:** a module developer writes an ordinary Prisma query with no isolation boilerplate; scoping is fully supplied by the request context | Code review of spike example module |

## Test scenarios (minimum set)

1. Client-A rep reads own rows → rows returned.
2. Client-A rep reads with omitted filter → only Client A rows.
3. Client-A rep queries Client B's row by ID → 0 rows (not 403 from app — this test bypasses the app layer deliberately).
4. Client-A rep inserts a row with `client_id = B` → rejected by `WITH CHECK`.
5. Unset scope → 0 rows on every client-scoped table (S2).
6. Staff role reads across clients → succeeds (RLS not blocking staff path).
7. Interleaved A/B/A requests on a deliberately tiny pool (size 2) → no bleed.
8. Transaction rollback mid-request → next request on the same connection has no residual scope.
9. Long-running query under load → pool starvation behavior observed and documented.

## Deliverables

1. **Spike repo** with the working pattern, tests for scenarios 1–9, and the soak/benchmark scripts.
2. **Numbers**: benchmark results (S4) recorded in the repo README.
3. **ADR-001 finalized** with the validated pattern, the policy SQL template, role setup, and pool sizing guidance.
4. **Go/no-go on external pooler**: explicit statement of whether pgBouncer/provider pooler is needed at launch scale.
5. If Pattern A fails: documented failure mode + Pattern B evaluation with the same criteria.

## Exit conditions

- **Success:** all S1–S7 pass → pattern becomes Phase 1.5 implementation as-is.
- **Partial:** S4 fails only (performance) → evaluate scoping RLS to client-rep read paths only, or Pattern B; decision recorded in ADR-001.
- **Failure:** S1–S3 unachievable with Prisma → escalate to an architecture decision: query-layer change for client-scoped paths (e.g., Kysely for the portal read layer) vs. dropping the DB backstop (**not acceptable** without an equivalent compensating control — this outcome reopens ADR-001).
