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

Data access: staff-path code uses `PrismaService`; client-representative-path code uses `ScopedPrismaService.forClient(clientId)` for reads and `ScopedPrismaService.transaction(clientId, …)` for multi-statement writes (mutation + audit), never the raw client. The reference implementation and its tests: `src/prisma/` and `test/rls.e2e-spec.ts`; write+audit exemplar: `modules/scope-check/` and `test/audit/audit-mutation.e2e-spec.ts`; migration exemplar: `prisma/migrations/*rls_roles_and_policies`.
