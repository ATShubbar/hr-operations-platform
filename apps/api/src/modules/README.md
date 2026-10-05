# Module layout contract (ADR-003)

Every business/shared module lives in `src/modules/<name>/` with this shape:

```
modules/<name>/
  public-api.ts       ← the ONLY file other modules may import from (lint-enforced)
  <name>.module.ts    ← NestJS module wiring
  api/                ← HTTP controllers (thin: validate → call application → map response)
  application/        ← services / use-cases (the module's capabilities)
  domain/             ← entities, value objects, domain events (add when needed)
  infra/              ← persistence and external adapters (add when needed)
```

## Rules

1. **Cross-module imports go through `public-api.ts` only.** Deep imports into another module's internals are a lint error (WS-08) and a review-blocking defect.
2. **`public-api.ts` exports the minimum**: the NestJS module class plus the services/events/types other modules are meant to use. If it isn't exported there, it's private.
3. **Own your data**: each module's tables carry its prefix (`example` → `ex_`, recruitment → `rec_`, GRO → `gro_`, employees → `emp_`, …). No module touches another module's tables — call the owning module's service or subscribe to its events (ADR-004).
4. **One owning module per capability.** Minimal code duplication is allowed when it reduces coupling; duplicated ownership of a business rule is never allowed.
5. `domain/` and `infra/` are added when the module actually needs them — empty ceremony directories are noise.

The `example/` and `example-consumer/` modules are the living reference for this shape (and the lint rule's test subjects). Copy `example/` when starting a new module.

## Client-scoped table checklist (ADR-001)

Every table holding client-owned data MUST, in the migration that creates it:

1. Carry a `client_id uuid NOT NULL` column (denormalized — including child tables; never derive scope through joins).
2. Grant table + sequence access to both roles:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_staff, app_client;
   GRANT USAGE, SELECT ON SEQUENCE <table>_id_seq TO app_staff, app_client;
   ```
3. Enable RLS and ship both policies (**the NULLIF is load-bearing** — SPIKE-001 finding: pooled reuse leaves the GUC as `''`, and a bare `::uuid` cast throws):
   ```sql
   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

   CREATE POLICY staff_full_access ON <table>
     FOR ALL TO app_staff USING (true) WITH CHECK (true);

   CREATE POLICY client_isolation ON <table>
     FOR ALL TO app_client
     USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
     WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
   ```
4. Register the table's endpoints in the isolation test harness (WS-18) — unregistered endpoints fail CI.
5. Audit every mutation (AUDIT-03): write the row and its `AuditService.record()` in ONE transaction (`ScopedPrismaService.transaction(clientId, …)` for the client-rep path), and declare each write route in `test/audit/audited-writes.ts` (as `AUDITED_WRITES` with its `resource.action`, or `AUDIT_EXEMPT_WRITES` with a reason) — undeclared mutating routes fail CI.

## Employee-readable table checklist (ADR-011, SS-02)

Employee self-service sessions (role `app_employee`, connection `EMPLOYEE_DATABASE_URL`) are
fenced to ONE employee record. A table an employee may read MUST, in its own migration:

1. Carry the employee reference the policy keys on — `employee_id uuid` (or, for
   `emp_employees`, its own `id`). Never derive it through a join.
2. Grant **SELECT only** to `app_employee`. Employees change nothing directly; a table that
   genuinely needs employee writes (SS-05 requests) designs them in its own card, with a
   `WITH CHECK`.
3. Ship an `employee_self` policy in the SPIKE-001 form (`NULLIF` is load-bearing):
   ```sql
   GRANT SELECT ON <table> TO app_employee;

   CREATE POLICY employee_self ON <table>
     FOR SELECT TO app_employee
     USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
   ```
4. Prove it in a test against the raw `app_employee` connection: own rows only with NO
   filter, a same-company colleague invisible, zero rows when unscoped (`test/rls-employee.e2e-spec.ts`).
5. Register employee endpoints as `employee` in the isolation registry — probed with a
   same-company colleague. Every OTHER non-public route must keep refusing employees (the
   harness's principal fence enforces it).

A table that NO company-scoped role reads (DEP-01 `emp_dependants`: client managers get nothing)
needs no `client_id` — grant `app_client` nothing and ship no client policy. Don't copy a
`client_id` that can go stale (a sponsorship transfer moves the employee, not their rows).
Where history refers to rows, withhold DELETE from `app_staff` too and remove softly.

Do NOT grant `app_employee` to `app_client` (or any role) to "switch role" inside a
transaction: Postgres applies a policy `TO app_employee` to its members, so the employee
policies would start applying to client-rep queries.

Data access: staff-path code uses `PrismaService`; client-representative-path code uses `ScopedPrismaService.forClient(clientId)` for reads and `ScopedPrismaService.transaction(clientId, …)` for multi-statement writes (mutation + audit), never the raw client; employee-self-service code uses `EmployeeScopedPrismaService.forEmployee(employeeId)` / `.transaction(employeeId, …)` with the id taken from the session, never from input. The reference implementation and its tests: `src/prisma/` and `test/rls.e2e-spec.ts`; write+audit exemplar: `modules/scope-check/` and `test/audit/audit-mutation.e2e-spec.ts`; migration exemplar: `prisma/migrations/*rls_roles_and_policies`.
