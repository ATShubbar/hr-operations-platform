# CLIENT-01 — Clients module + registry table + RLS + service — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → CLIENT-01 (ACTION-PLAN 2.5)
- Status: done
- Commit: `CLIENT-01: clients module + cli_clients registry (PK-scoped RLS)`

## What shipped

- `clients` module (ADR-003 layout): `public-api.ts`, `ClientsService`
  (create/list/get), domain input type.
- Prisma `Client` model + migration `20260721173628_clients`: `cli_clients`
  (`id uuid pk`, `name_ar`, `name_en`, `status active|inactive`, timestamps),
  grants + RLS.
- Seed: two client companies with the well-known `SEED_CLIENT_A/B` ids
  (bilingual names), idempotent via upsert.

## The design variation (flagged and approved)

`cli_clients` originates `client_id` and is itself client-scoped, but **the RLS
scope key is the row's OWN primary key** — a client *is* the client, so there
is no denormalized `client_id` column. The client-rep policy is
`USING (id = NULLIF(current_setting('app.client_id', true), '')::uuid)`.
Documented in the migration and schema comment. No cross-module FK from
`auth_users.client_id` (auth predates clients; the link is validated at the app
layer in CLIENT-03).

## DoD check

| DoD item | Result |
|---|---|
| Migration applies to fresh DB | ✅ `20260721173628_clients` applied |
| Grant/RLS matrix correct | ✅ app_staff CRUD; app_client SELECT-only; policies `staff_full_access` (ALL) + `client_read` (SELECT) |
| `ClientsService` create/list/get (staff path) | ✅ create → get → list all pass |
| RLS: client-rep reads ONLY its own row (PK-keyed) | ✅ scope C1 → only C1; scope C2 → only C2 |
| Client-rep cannot write | ✅ INSERT/UPDATE/DELETE → permission denied |
| Seed idempotent, originates A/B | ✅ ran twice → 2 client companies with seed ids |
| `lint typecheck test build` green; registry untouched | ✅ turbo 15/15; API 74/74 (17 files, +3); no HTTP endpoints yet |

## Grant + RLS matrix on `cli_clients` (DB-verified)

```
  grantee   |                     privileges
------------+---------------------------------------------------------------
 app_client | SELECT                                              (own row only, via RLS)
 app_staff  | DELETE, INSERT, SELECT, UPDATE                      (permissive staff policy)
 hr         | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, ...    (owner; migrations only)

      polname      | polcmd |    roles
-------------------+--------+--------------
 client_read       |   r    | {app_client}   (r = SELECT; USING id = own scope)
 staff_full_access |   *    | {app_staff}    (* = ALL)
```

## Test output (`test/clients.e2e-spec.ts`, 3/3)

```
✓ staff can create, read back, and list client companies
✓ client-rep reads ONLY its own company row (RLS keyed on the PK)
✓ client-rep cannot write client companies (no grant)
```

Seed (idempotent):
```
Seed complete: 2 client companies; 3 scope-check rows ...; 9 auth users ...
 11111111-…-111111111111 | Alpha Trading Co.     | شركة الألف التجارية
 22222222-…-222222222222 | Beta Contracting Est. | مؤسسة الباء للمقاولات
```

Full pipeline: `pnpm turbo run lint typecheck test build` → **15/15**, API **74/74**.

## Deferred to CLIENT-02+ (stated)

- HTTP endpoints (`client.create/read/update/delete`), audited + isolation-harness
  registered → **CLIENT-02**.
- Client-rep read of its own company through `ScopedPrismaService` (the app-path
  proof of the PK-keyed policy) lands with the read endpoint in CLIENT-02.
- Client portal users (Client Admin invites Client Users) → **CLIENT-03**.
- Clients console UI → **CLIENT-04**.
