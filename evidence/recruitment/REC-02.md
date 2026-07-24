# REC-02 — Vacancies HTTP API (staff CRUD + `vacancy.approve` workflow + client-rep read-own) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → REC-02 (ACTION-PLAN 4.1)
- Status: done
- Commit: `REC-02: vacancies HTTP API — staff CRUD + vacancy.approve workflow + client-rep read-own`

## What shipped

The vacancies HTTP surface — an **asymmetric dual-path** resource: staff manage
vacancies across all clients; client reps only READ their own client's vacancies.

| Route | Permission | Scope | Notes |
|---|---|---|---|
| `POST /vacancies` | `vacancy.create` | staff | validates clientId (unknown → 404) |
| `GET /vacancies` | `vacancy.read` | client-read | dual-path (rep → own client, RLS) |
| `GET /vacancies/:id` | `vacancy.read` | client-read | dual-path |
| `PATCH /vacancies/:id` | `vacancy.update` | staff | core edits (bilingual title/dept/headcount) |
| `POST /vacancies/:id/status` | `vacancy.approve` | staff | workflow-validated (illegal → 400) |
| `DELETE /vacancies/:id` | `vacancy.delete` | staff | hard delete, audited |

- **Status workflow** (`domain/vacancy-status-workflow.ts`): draft→open,
  open→filled/closed, filled→closed, draft|open→cancelled; closed/cancelled terminal.
- **Service** grew the client-rep READ path (`listForClient`/`findForClient` via
  `ScopedPrismaService` — RLS-enforced), `changeStatus` (validated + audited), and
  `remove`. Writes stay staff-only (clients hold no vacancy write permission and
  `app_client` has a SELECT-only grant).
- **Contracts** (`packages/contracts/src/vacancy.ts`) — request/response schemas;
  the response maps `titleAr`/`titleEn` → `title.{ar,en}`.

## Permission grants — the deliberate matrix mapping

`vacancy.read` is granted **per-role, NOT via STAFF_BASE** — because GRO Officer
and Finance are excluded from recruitment (matrix). Grants:

| Role | vacancy perms |
|---|---|
| recruiter | read, create, update, approve, delete (full CRUD) |
| company_admin | read, update, approve |
| system_admin, hr_officer, read_only | read |
| **gro_officer, finance** | **none** |
| client_admin, client_user | read (own, via ALL_CLIENT) |

## DoD check

| DoD item | Result |
|---|---|
| Staff CRUD; illegal transition → 400; unknown id → 404 | ✅ tests 1, 3, 4, 9 |
| Client rep reads ONLY own vacancies (dual-path, RLS); foreign id → 404 | ✅ test 6 |
| Client rep CANNOT create/update/approve/delete (403) | ✅ test 7 |
| GRO staff → 403 on read (vacancy.read not granted) | ✅ test 8 |
| Every mutation audited; 4 write routes in `audited-writes`; write-coverage green | ✅ write-coverage 3/3 |
| Isolation harness (6 routes) + permission-catalog coverage green | ✅ isolation 10/10; authz green |
| Suite + lint + typecheck (all 6 pkgs) + build green | ✅ suite **251/251** |

## Test output (`test/recruitment-vacancies-api.e2e-spec.ts`, 9/9)

```
✓ recruiter creates vacancies (draft) for either client
✓ rejects create for an unknown client (404)
✓ recruiter updates a vacancy
✓ advances status along the workflow; rejects an illegal transition
✓ a client rep reads ONLY their own client vacancies
✓ a client rep cannot write vacancies (403)
✓ GRO staff cannot read recruitment (403 — vacancy.read not granted)
✓ rejects unauthenticated callers (401)
✓ recruiter deletes a vacancy
```

Full suite **49 files / 251 passed** (was 242 + 9 new).

## Note — REC-01 test typecheck fix

The REC-01 spec (`recruitment-vacancies.e2e-spec.ts`) had a latent `tsc` null-safety
issue (`entries[0].after` — object-possibly-undefined) that vitest's esbuild runtime
never surfaced; caught here by the full `tsc --noEmit`. Fixed (`entries[0]?.after`)
in this commit. Going forward, run `typecheck` (not just `build`) after adding specs.

## Files

- `packages/contracts/src/vacancy.ts` (+ index export)
- `apps/api/src/modules/recruitment/api/vacancies.controller.ts` (NEW)
- `apps/api/src/modules/recruitment/application/vacancies.service.ts` (+ client-rep read, changeStatus, remove)
- `apps/api/src/modules/recruitment/domain/vacancy-status-workflow.ts` (NEW)
- `apps/api/src/modules/recruitment/recruitment.module.ts` (+ controller, ClientsModule)
- `apps/api/src/modules/auth/domain/permissions.ts` (5 vacancy.* perms + grants)
- `apps/api/test/isolation/endpoint-registry.ts` (6 routes) · `test/audit/audited-writes.ts` (4 writes)
- `apps/api/test/recruitment-vacancies-api.e2e-spec.ts` (NEW) · `recruitment-vacancies.e2e-spec.ts` (tsc fix)

## Next (REC-03)

`rec_candidates` staff-owned table + `CandidatesService` — candidates attach to a
vacancy, carry a pipeline stage + optional CV document link.
