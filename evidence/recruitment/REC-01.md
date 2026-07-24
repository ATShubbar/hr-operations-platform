# REC-01 — `rec_vacancies` table + VacanciesService (staff path) + seed — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REC-01 (ACTION-PLAN 4.1)
- Status: done
- Commit: `REC-01: rec_vacancies client-scoped table + VacanciesService (staff path) + seed`

## What shipped

The Recruitment epic's foundation — the vacancy table + the staff-path service.
No HTTP surface / permissions yet (those land with REC-02, mirroring REQ-01→REQ-02).

- **`rec_vacancies`** — a client-scoped table (a vacancy is an open position the
  consultancy recruits for AT a client company): `clientId`, bilingual
  `titleAr`/`titleEn`, optional `description`/`department`, `headcount` (default 1),
  `status` (`VacancyStatus`: draft → open → filled → closed, + cancelled),
  `openedByUserId`, timestamps; indexed on `clientId` + `status`.
- **`VacanciesService`** (staff path, `PrismaService`) — `create` / `update` /
  `list` / `listByClient` / `getById`. Every mutation writes its `AuditService.record`
  in the SAME transaction (`resource: 'vacancy'`), scoped to the vacancy's client.
- **Module wiring** — `modules/recruitment/` (module, `public-api.ts`, service,
  `domain/vacancy.ts`); registered in `AppModule`.
- **Seed** — 3 vacancies across the seed clients (Senior Accountant [open],
  Site Supervisor [draft] for client A; Civil Engineer [open] for client B).

## Client-scoping — the deliberate difference from Requests

Clients only **read** their own vacancies (matrix: Client Admin/User = "R own
vacancies"), so — unlike `req_requests` — `app_client` is granted **SELECT only**.

```
 grantee    |             privs
------------+--------------------------------
 app_client | SELECT
 app_staff  | DELETE, INSERT, SELECT, UPDATE
```

RLS enabled with both policies (the load-bearing `NULLIF`, SPIKE-001):

```
 rls_enabled = t

      polname      |     role     | cmd |                         using_expr
-------------------+--------------+-----+-------------------------------------------------------------
 client_isolation  | {app_client} | ALL | (client_id = (NULLIF(current_setting('app.client_id', true), ''))::uuid)
 staff_full_access | {app_staff}  | ALL | true
```

## DoD check

| DoD item | Result |
|---|---|
| Migration applies; `db:generate` regenerates the client (delegate exists) | ✅ `migrate deploy` + `generate` clean; `owner.vacancy` delegate used in tests |
| RLS enabled + both policies; `app_client` SELECT only | ✅ psql output above |
| `VacanciesService` create/update audited in the same tx (`resource: 'vacancy'`) | ✅ REC-01 spec asserts the aud_entries rows |
| Seed inserts vacancies; `db:seed` clean | ✅ "…; 3 vacancies; …" |
| Suite + lint + typecheck + build green | ✅ suite **242/242**; lint + tsc + build clean |
| No endpoints yet → no isolation/permission/audited-writes changes | ✅ isolation harness unchanged + green |

## Test output (`test/recruitment-vacancies.e2e-spec.ts`, 3/3)

```
✓ creates a vacancy (draft by default) and audits it in the same transaction
✓ updates a vacancy and audits the before/after
✓ returns null when updating a missing vacancy (no audit written)
```

Full suite **48 files / 242 passed** (was 239 + 3 new).

## Files

- `apps/api/prisma/schema.prisma` (Vacancy model + VacancyStatus enum)
- `apps/api/prisma/migrations/20260724165955_recruitment_vacancies/migration.sql`
- `apps/api/src/modules/recruitment/{recruitment.module.ts, public-api.ts,
  application/vacancies.service.ts, domain/vacancy.ts}`
- `apps/api/src/app.module.ts` (register RecruitmentModule)
- `apps/api/prisma/seed.ts` (seedVacancies)
- `apps/api/test/recruitment-vacancies.e2e-spec.ts`

## Next (REC-02)

Vacancies HTTP API — staff CRUD + `vacancy.approve` status workflow
(draft → open → filled/closed), the `vacancy.*` permission catalog, the client-rep
read-own dual-path, isolation registration, and the audited-writes declarations.
