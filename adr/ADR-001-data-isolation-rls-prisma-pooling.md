# ADR-001 — Data isolation: client_id + RLS with Prisma and pooling

- Status: Proposed (pending SPIKE-001)
- Date: 2026-07-18
- Owner: TBD

## Context
One consultancy operates the system; many client companies are managed within it. Client-company representatives log in and must be strictly isolated to their own client's records. The data is highly sensitive (passports, iqamas, salaries). Application-level filtering alone fails *open*: one forgotten `where client_id` clause is a cross-client data leak. We need a database-enforced backstop, and it must coexist with Prisma's connection pooling without leaking session state between requests.

## Options considered
1. **Application-level scoping only (Prisma middleware/extension adds `client_id`).** Simple, fast — but a single missed code path leaks data; unacceptable as the only control.
2. **Schema-per-client or database-per-client.** Strongest isolation, but operational overhead (migrations × N clients, connection fan-out) is disproportionate for one consultancy with many small clients.
3. **Shared schema + mandatory `client_id` + PostgreSQL Row-Level Security as backstop.** App scoping remains the front line; RLS makes a missed filter return zero rows instead of leaking. Known friction: RLS needs per-request session state under pooled connections.

## Decision
Option 3. Every client-owned table (including child tables — denormalized, never derived through joins) carries `client_id`. Two DB roles: `app_staff` (no RLS; authorization enforced by the application policy service) and `app_client` (`FORCE ROW LEVEL SECURITY`). Policies read `current_setting('app.client_id', true)` and fail closed when scope is unset. Scope is set transaction-locally (`set_config(..., true)`) via a Prisma client extension so pooled connection reuse cannot bleed scope.

The pattern is **validated by SPIKE-001 before production schema exists**. If the spike fails criteria S1–S3, this ADR reopens (see spike exit conditions).

## Consequences
- Cross-client leak requires two independent failures (app + policy), and CI carries an isolation test harness as a third net.
- Every client-scoped query for client-rep sessions runs inside an interactive transaction — pool sizing and latency overhead are measured in the spike (S4).
- RLS policies and roles are managed in raw SQL migrations under `prisma migrate`; schema PRs touching client-scoped tables must include policy coverage.
- Multi-consultancy SaaS remains possible later by wrapping this model in an organization scope; we avoid global uniqueness constraints on business identifiers to keep that door open.

## Links
- `SPIKE-001-rls-prisma-pooling.md` (goals, success criteria, recommended pattern)
- `architecture.md` — Operating Model & Data Isolation
- ADR-002 (staff-path authorization), ADR-006 (pooler availability depends on provider)
