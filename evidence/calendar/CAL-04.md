# CAL-04 — One definition of "finished" for every screen — Evidence

- Date: 2026-10-05
- Card: `BACKLOG.md` → CAL-04 (found in DS-14). Status: **done**.

## Owner decision

| Question | Answer |
|---|---|
| Is a RESOLVED request finished? | **Finished** (recommended). The work is done; it only waits to be closed. Reopening makes it open again. |

A REJECTED procedure is open work: the workflow retries it (`rejected → in_progress`) or cancels it. That follows from the workflow, not a choice, and the card said so.

## The inconsistency, measured before the change

| | Procedure "finished" | Request "finished" |
|---|---|---|
| API: calendar view (`calendar-view.ts` TERMINAL), reports (`isActive*`) | completed, **rejected**, cancelled | closed, cancelled (**resolved counted active / overdue**) |
| Web: queue, both Overviews, client figures, dashboard, Open-work tabs | completed, cancelled | **resolved**, closed, cancelled |

So the same rejected procedure was in the queue but not on the calendar or in the report's overdue count, and a resolved request was finished in the queue but still on the calendar and "overdue" in Service operations. The web side also had **three** separate copies (`DONE`/`FINISHED` sets, `GRO_ACTIVE`, `TASK_OPEN`, `REQUEST_OPEN`, `GRO_DONE`).

## What was built

| Piece | What |
|---|---|
| `packages/contracts/src/work-status.ts` | `FINISHED` per kind (task: done, cancelled · request: resolved, closed, cancelled · procedure: completed, cancelled) and `isFinished(kind, status)`; everything else is open. **No zod**: published on a subpath, `@hr/contracts/work-status`, so the web imports it without shipping zod (the DS-06 landmine). Also re-exported from the package root for the API. |
| API | `calendar-view.ts` (`isActiveDeadline`) and `reporting.service.ts` (`isActiveProcess/Request/Task`) now call `isFinished`. |
| Web | `queue-items.ts` (open = not finished, finished = finished, for every kind), `overview/page.tsx`, `client-overview.tsx`, `client-figures.ts`, `reports/dashboard.tsx`, the client record's Open work tab, and `gro-work-list.tsx` (`GRO_ACTIVE` → `isOpenProcedure`, used by both records' Open work tabs and the dashboard). |
| Kept on purpose | `client-overview.tsx`'s `WAITING` (open + in progress) is "with the team", deliberately excluding info_needed (waiting on the client, THREAD-03). It's a different question, not a finished rule, and the comment now says so. |

## Tests

- **`packages/contracts/src/work-status.test.ts`: 4/4.** For each kind, **every status in the workflow enum is decided**: it's in exactly one of {finished, open}, none missing. **A status added later fails this test until someone decides it.** The owner's two decisions are asserted by name.
- **`apps/api/test/work-status.e2e-spec.ts`: 2/2.**
  - A REJECTED procedure past due is **on `/calendar/view`**, and the GRO workload report's `active` and `overdue` each go up by 1.
  - A RESOLVED request past due is **not on the calendar** and doesn't change `requestsOverdue`, while an IN-PROGRESS one past due is on it and does (+1), so the test can tell the difference.
  - Both ran red before the change, for exactly the card's reasons.

**Red proofs on the one shared module** (rebuilt each time, so the API saw it):

| Shared rule changed to | Result |
|---|---|
| rejected = finished (the old calendar rule) | 2 unit tests + the procedure e2e test red |
| resolved = open (the old calendar rule) | 2 unit tests + the request e2e test red |
| restored | 4/4 + 2/2, file byte-identical |

**Full API suite: 665/665** (663 + 2). `@hr/contracts`: 7/7, lint + typecheck green. `@hr/web`: typecheck + lint green.

## Live (local, browser) — GRO officer

Seeded procedure "Sponsorship transfer" (QIWA-2026-4567) temporarily set **rejected**, due 4 Oct (past due):
- `/api/calendar/view` (28 Sep – 11 Oct): **present** (status `rejected`, 4 Oct); **0 resolved requests** shown.
- **Calendar screen** (agenda): "Sponsorship transfer" listed.
- **Work queue**: "Sponsorship transfer · QIWA-2026-4567 · Rajesh Kumar · Beta Contracting Est. · Rejected · 1 day over". The queue and the calendar now agree.
- **No zod in the browser:** the queue page's 5 `/_next/` scripts were fetched and searched for zod. None contain it, so the subpath import kept it out.

**Cleanup:** the procedure restored to `submitted`, signed out.
