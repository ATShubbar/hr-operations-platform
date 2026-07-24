# GRO-01 — `gro_processes` table + GroProcessesService (staff path) + seed — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → GRO-01 (ACTION-PLAN 4.2)
- Status: done
- Commit: `GRO-01: gro_processes client-scoped table + GroProcessesService (staff path) + seed`

## What shipped

The GRO epic's foundation — the government-process table + staff-path service. No
HTTP surface / permissions yet (those land with GRO-02, mirroring REC-01→REC-02).

- **`gro_processes`** — a client-scoped table tracking a government procedure for an
  employee: `clientId`, `employeeId` (a plain cross-module reference to
  `emp_employees` — no FK, like `task_tasks.request_id`), `type` (`GroProcessType`:
  iqama_issue, iqama_renewal, exit_reentry, final_exit, profession_change,
  sponsorship_transfer, work_permit_renewal, other), `status` (`GroProcessStatus`:
  not_started → in_progress → submitted → approved/rejected → completed/cancelled,
  default `not_started`), `referenceNumber` (gov reference), `dueDate` (stored
  Gregorian — Hijri is a render concern), `assigneeUserId`, `notes`,
  `createdByUserId`; indexed on clientId, employeeId, status, dueDate.
- **`GroProcessesService`** (staff path) — `create` / `list({clientId?, employeeId?})`
  / `getById` / `update`, each mutation audited in the same transaction
  (`resource: 'gro-process'`), scoped to the process's client.
- **Module** `modules/gro/` registered in `AppModule`.
- **Seed** — 3 processes (iqama_renewal [in_progress] + exit_reentry [not_started]
  on client A's Ahmed Hassan; sponsorship_transfer [submitted] on client B's Rajesh).

## Client-scoping — clients read own (status only)

Clients may READ their own processes (matrix: "R own, status only"), so — like
`rec_vacancies` — `app_client` gets **SELECT only**; `app_staff` full CRUD.

```
 rls = t

  grantee   |             privs               |      polname       |     role
------------+---------------------------------+--------------------+--------------
 app_client | SELECT                          | client_isolation   | {app_client}
 app_staff  | DELETE, INSERT, SELECT, UPDATE  | staff_full_access  | {app_staff}
```

Both policies carry the load-bearing `NULLIF` (SPIKE-001).

## DoD check

| DoD item | Result |
|---|---|
| Migration applies + `db:generate` (delegate exists) | ✅ `migrate deploy` + `generate` clean; `owner.groProcess` used in tests |
| `app_client` SELECT only, RLS + both policies | ✅ psql output above |
| create/update audited in one tx (`resource: 'gro-process'`) | ✅ GRO-01 spec asserts the aud_entries rows |
| Status defaults `not_started`; list filters by employee | ✅ tests 1, 3 |
| Seed inserts processes; suite + lint + typecheck + build green | ✅ "…; 3 GRO processes; …"; suite **272/272** |
| No endpoints yet → no isolation/permission/audited-writes changes | ✅ harness unchanged + green |

## Test output (`test/gro-processes.e2e-spec.ts`, 4/4)

```
✓ creates a process (not_started by default) and audits it in the same transaction
✓ updates a process and audits before/after
✓ lists processes filtered by employee
✓ returns null when updating a missing process
```

Full suite **53 files / 272 passed** (was 268 + 4 new).

## Files

- `apps/api/prisma/schema.prisma` (GroProcess + GroProcessType + GroProcessStatus)
- `apps/api/prisma/migrations/20260724175339_gro_processes/migration.sql`
- `apps/api/src/modules/gro/{gro.module.ts, public-api.ts, application/gro-processes.service.ts, domain/gro-process.ts}`
- `apps/api/src/app.module.ts` (register GroModule)
- `apps/api/prisma/seed.ts` (seedGroProcesses)
- `apps/api/test/gro-processes.e2e-spec.ts`

## Next (GRO-02)

GRO HTTP API — staff CRUD + the `gro.process` status workflow (not_started →
in_progress → submitted → approved/rejected → completed/cancelled) + the client-rep
read-own path (status-only redaction) + the `gro.read`/`gro.process` permission
catalog, isolation + audited-writes registration.
