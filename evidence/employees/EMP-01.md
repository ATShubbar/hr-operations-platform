# EMP-01 — Employees module + registry table + RLS + service — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → EMP-01 (ACTION-PLAN 3.1)
- Status: done
- Commit: `EMP-01: employees module + emp_employees registry (client_id RLS)`

## What shipped

- `employees` module (ADR-003 layout): `public-api.ts`, `EmployeesService`
  (create/list/listByClient/get), domain input type.
- Prisma `Employee` model + 7 enums + migration `20260721184243_employees`:
  `emp_employees` — the domain core, **built from `docs/FIELD-MAPPING.md` (0.8)**.
  All three sensitivity groups (`core`/`salary`/`govdata`) as columns on one
  table; dates stored Gregorian UTC (@db.Date); salary as `Decimal(12,2)`.
- Seed: 3 employees across clients A/B (Saudi w/ national id + salary; non-Saudi
  w/ iqama/work-permit/expiry; GOSI/WPS status), idempotent via upsert.

## Design decisions (per the card + doc)

- **Standard `client_id`-column RLS** (unlike `cli_clients`' PK-scoped variant):
  `client_read USING client_id = NULLIF(current_setting('app.client_id', true),
  '')::uuid`. Staff full; a client-rep may **READ ONLY** its own client's
  employees, never write (SELECT grant only).
- **All fields on one table; field-level authorization is EMP-02** (redacting
  `salary`/`govdata` per capability at the API layer) — not separate tables.
- **No cross-module FK** on `client_id` (employees vs clients are separate
  modules; validated app-side when the write API lands — consistent with
  `auth_users`).

## DoD check

| DoD item | Result |
|---|---|
| Migration applies to fresh DB | ✅ `20260721184243_employees` applied |
| Grant/RLS matrix | ✅ app_staff CRUD; app_client SELECT-only; policies `staff_full_access` (ALL) + `client_read` (SELECT) |
| Service create/list/get; core+salary+govdata round-trip | ✅ Decimal salary, iqama, GOSI status all round-trip |
| RLS: client-rep reads own client only | ✅ scope C1 → only C1 rows; scope C2 → only C2; never the other |
| Client-rep cannot write | ✅ INSERT/UPDATE/DELETE → permission denied |
| Seed idempotent | ✅ ran twice → 3 employees, Saudi + non-Saudi spread |
| `lint typecheck test build` green; registry untouched | ✅ turbo 15/15; API 100/100 (+3); no HTTP endpoints (EMP-02) |

## Grant + RLS matrix on `emp_employees` (DB-verified)

```
  grantee   |                     privileges
------------+---------------------------------------------------------------
 app_client | SELECT                                       (own client only, via RLS)
 app_staff  | DELETE, INSERT, SELECT, UPDATE               (permissive staff policy)
 hr         | ... full ...                                 (owner; migrations only)

      polname      | polcmd |    roles
-------------------+--------+--------------
 client_read       |   r    | {app_client}   (r = SELECT; USING client_id = own scope)
 staff_full_access |   *    | {app_staff}    (* = ALL)
```

## Test output (`test/employees.e2e-spec.ts`, 3/3)

```
✓ staff create round-trips core + salary + govdata fields
✓ client-rep reads ONLY its own client’s employees (client_id-scoped RLS)
✓ client-rep cannot write employees (no grant)
```

Seed (idempotent): `3 employees` — Mohammed Alabdullah (SA, national id),
Ahmed Hassan (EG, iqama/work-permit), Rajesh Kumar (IN, iqama).
Full pipeline: `pnpm turbo run lint typecheck test build` → **15/15**, API **100/100**.

## Deferred to EMP-02+ (stated)

- Employees HTTP API (`employee.*`) with **field-level authorization**
  (`salary`/`govdata` redacted per capability; rep `govdata` = expiry/status
  only) + audit + isolation-harness registration → **EMP-02**.
- Client-rep read-own-employees through `ScopedPrismaService` + granting reps
  the perms → EMP-02/portal (like `client.read`).
- Web UI → EMP-03.
