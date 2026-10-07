# MOB-01 — Sequence tables, the step engine and an audited service — Evidence

- Date: 2026-10-07
- Status: **done**. API only, no HTTP routes (MOB-02).
- Decision: ADR-018. Card approved by the owner, including the rule that **a completed final exit cannot be reopened**.

## What changed

| File | Change |
|---|---|
| `prisma/schema.prisma` + `migrations/20261007120000_gro_sequences` | **`gro_sequences`**: employee, company, kind (`onboarding` / `final_exit`), status (`running` → `completed` / `cancelled`), `started_on`, who started it, completed/cancelled stamps. **`gro_sequence_steps`**: one row per step created at start; `filed_on` + `filed_by`. **Partial unique index**: one *running* run per employee per kind. CHECKs: completed ⇔ `completed_at`, cancelled ⇔ `cancelled_at`, `filed_on` ⇔ `filed_by`. **Grants**: `app_staff` SELECT/INSERT/UPDATE, **no DELETE**; `app_client` and `app_employee` nothing. RLS `staff_full_access`. |
| `gro/domain/sequence-definitions.ts` | The prototype's `RUNBOOKS`, word for word: onboarding with 11 steps, final exit with 8. Each step has a portal, target day, what it waits on, a standard fee and a note. |
| `gro/domain/sequence-engine.ts` | **Pure.** `stepsOf` (filed / ready / blocked, with the names of what a step waits on; target = start + day), `filedDependents`, `isComplete`, `stepDefinition`, and `integrityProblems`: each `needs` must name an **earlier** step, which rules out cycles; no duplicate keys; the first step waits on nothing; no target before what it waits on. |
| `gro/application/sequences.service.ts` | `start`, `file`, `reopen`, `cancel`, `get`, `listForEmployee`. Each write and its audit share one transaction. Audit resource is **`gro-sequence`** against the **employee** (start / file-step / reopen-step / complete / cancel), routine severity. |
| `gro.module.ts`, `public-api.ts` | Service provided and exported; the engine is exported for tests (the boundary lint rejected deep imports). |

**Service rules:**
- **`start`:** an unknown employee gives 404 and a terminated one gives 400. A second running run of the same kind gives 409, also when caught by the index on a race (`P2002` is mapped to 409). A final exit while onboarding runs gives 409.
- **`file`:** ready steps only. Blocked gives 409 naming what it waits on; already filed gives 409; an unknown step gives 400. Today by default, earlier allowed, the **future refused (400)**. Filing the last step marks the run **completed**.
- **`reopen`:** refused while a filed step depends on it, with 409 naming that step. Unfiled gives 409; cancelled gives 409. **A completed final exit gives 409.** A completed onboarding reopens and runs again (the prototype's behaviour). A reopened step **keeps its row**.
- **`cancel`:** running only, else 409.

## Tests: `test/gro-sequences.e2e-spec.ts`, 14/14

- **Engine (4):**
  - the lists are the prototype's (11/8, first and last keys) and pass `integrityProblems`;
  - states and targets (block-visa ready on the start date; visa-auth blocked "Waiting on Block visa requested", +7 days; bank +50);
  - a step that waits on two others is ready only when both are filed;
  - reopen is blocked only by a *filed* dependent, and "complete" means every step filed.
- **Service (7):**
  - start with 8 step rows + audit (company, actor), then a duplicate gives 409;
  - terminated gives 400, unknown 404, final exit during onboarding 409;
  - filing order: settlement before clearance gives 409 naming "Company clearance and handover"; an unknown step 400; tomorrow 400; filing 3 days ago works; filing again 409; exactly 1 `file-step` audit;
  - reopen is refused by a filed dependent; reopening the later one first works; the row is kept with `filed_on/by` NULL; reopening an unfiled step 409;
  - the full final exit completes with one `complete` audit; reopen and file then give 409, and a new final exit can start;
  - a completed onboarding reopens to `running` with `completedAt` cleared, audited;
  - cancel works and is audited; cancelling again 409; filing on a cancelled run 409; the slot is freed.
- **Database fences (3):**
  - a second running row inserted on the **staff connection** is refused by the index;
  - client managers get `permission denied` on both tables;
  - the staff connection gets `permission denied` on DELETE of both.

## Red proofs (each broken, its test fails, then restored)

| Broken | Failed |
|---|---|
| Engine: every unfiled step `ready` | 5 (states, two-needs, filing order, reopen, completion) |
| Engine: `filedDependents` returns nothing | 3 |
| Step list: block-visa made to wait on `bank` | 3 (integrity, states, onboarding reopen) |
| Service: the blocked check removed | 3 |
| Service: a completed final exit made reopenable | 1 |
| Database: the partial unique index dropped | 1 (one running per kind) |
| Database: `app_client` granted SELECT + an open policy | 1 (client managers) |
| Database: `app_staff` granted DELETE | 1 (nobody deletes) |

- All source files were restored **byte-identical** (`cmp`).
- The grants, policies and index were read back from `information_schema` / `pg_policies` / `pg_indexes`, exactly as the migration wrote them.

## Gates

- **Full API suite 715/715, twice.**
- api `typecheck` + `lint` clean. The boundary lint caught the test's deep imports into `gro/domain`; they now go through `gro/public-api`.
- Re-seeded after the suite.
