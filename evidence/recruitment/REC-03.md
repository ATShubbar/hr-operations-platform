# REC-03 — `rec_candidates` table + CandidatesService (staff path) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REC-03 (ACTION-PLAN 4.1)
- Status: done
- Commit: `REC-03: rec_candidates staff-owned table + CandidatesService`

## What shipped

The candidate foundation — the staff-internal pipeline registry. No HTTP surface /
permissions yet (those land with REC-04, mirroring REC-01→REC-02).

- **`rec_candidates`** — a STAFF-OWNED table (a candidate's PII/CV is the
  consultancy's recruitment data; clients never see applicants): `clientId`
  (denormalized from the vacancy, for audit scope/reporting), `vacancyId`,
  bilingual `nameAr`/`nameEn`, optional `email`/`phone`, `stage`
  (`CandidateStage`: applied → screening → interview → offer → hired/rejected/
  withdrawn, default `applied`), optional `cvDocumentId`, `notes`,
  `createdByUserId`; indexed on `vacancyId`, `clientId`, `stage`.
- **`CandidatesService`** — `create` (validates the vacancy via `VacanciesService`
  and **derives `clientId` from it** — a candidate can never be attributed to a
  client the vacancy doesn't belong to; audited `resource: 'candidate'`),
  `list({vacancyId?, stage?})`, `getById`, `update` (core fields, audited). No
  client-rep path (staff-internal).
- **Seed** — 3 candidates on the seeded open vacancies (2 on client A's Senior
  Accountant [screening/interview], 1 on client B's Civil Engineer [applied]).

## Staff-owned scoping (like task_tasks)

Clients get NOTHING — `app_client` is not granted, and there is no client RLS
policy. `app_staff` has full CRUD under `staff_full_access` (defence-in-depth).

```
 rls = t

  grantee  |             privs               |      polname       |    role
-----------+---------------------------------+--------------------+-------------
 app_staff | DELETE, INSERT, SELECT, UPDATE  | staff_full_access  | {app_staff}
(no app_client grant, no client_isolation policy)
```

## References by UUID, not FK

`vacancyId` (intra-module) and `cvDocumentId` (a cross-module reference to the
documents module's `doc_documents`) are plain indexed UUID columns — no DB FK —
matching how `task_tasks.request_id` links to Requests. The service validates the
vacancy at the application layer.

## DoD check

| DoD item | Result |
|---|---|
| Migration applies + `db:generate` (delegate exists) | ✅ `migrate deploy` + `generate` clean; `owner.candidate` used in tests |
| `app_staff` full CRUD, NO `app_client` grant, RLS on | ✅ psql output above |
| `create` validates vacancy (unknown → error), derives clientId, audits | ✅ tests 1, 2 |
| `update` audits before/after; `list` filters by vacancy | ✅ tests 3, 4 |
| Candidate starts at stage `applied` | ✅ test 1 |
| Seed inserts candidates; suite + lint + typecheck + build green | ✅ "…; 3 candidates; …"; suite **256/256** |

## Test output (`test/recruitment-candidates.e2e-spec.ts`, 5/5)

```
✓ creates a candidate — derives clientId from the vacancy, defaults stage, audits
✓ rejects a candidate for an unknown vacancy
✓ updates a candidate and audits the before/after
✓ lists candidates filtered by vacancy
✓ returns null when updating a missing candidate
```

Full suite **50 files / 256 passed** (was 251 + 5 new).

## Files

- `apps/api/prisma/schema.prisma` (Candidate + CandidateStage)
- `apps/api/prisma/migrations/20260724171927_recruitment_candidates/migration.sql`
- `apps/api/src/modules/recruitment/application/candidates.service.ts` (NEW)
- `apps/api/src/modules/recruitment/domain/candidate.ts` (NEW)
- `apps/api/src/modules/recruitment/{recruitment.module.ts, public-api.ts}` (+ CandidatesService)
- `apps/api/prisma/seed.ts` (seedCandidates)
- `apps/api/test/recruitment-candidates.e2e-spec.ts` (NEW)

## Next (REC-04)

Candidates HTTP API — staff CRUD + the pipeline **stage-transition workflow**
(applied → screening → interview → offer → hired/rejected/withdrawn), the
`candidate.*` permission catalog, isolation + audited-writes registration.
