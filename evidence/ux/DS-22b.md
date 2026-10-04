# DS-22b — Work queue: Open / Finished — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → DS-22b (DS epic, ADR-012)
- Status: done
- Commit: `DS-22b: the Work queue's Finished view; GRO and Task history retired`
- Scope: `apps/web` only. **No API change.**

## Owner decision (with DS-22)

"A Finished view in the Work queue": finished work moves into the queue, and `/gro` and `/tasks` redirect there.

## What changed

| File | Change |
|---|---|
| `queue/queue-items.ts` | `useQueueItems(sources, view)`. **Open** is unchanged. **Finished** = procedures completed or cancelled · requests resolved, closed or cancelled · tasks done or cancelled, newest-finished first. `QueueItem.finishedAt` = the last update (nothing records when work finished; the same approximation as DS-17's "cleared today") |
| `queue/page.tsx` | An **Open / Finished** switch at the start of the toolbar. In Finished: grouped by the local month it finished, with its own summary and empty state. Search, kind pills, client and Assigned to me work in both views. `?view=finished&kind=…` presets it |
| `queue/finished-row.tsx` (new) | Icon, title (opens the dialog), reference, meta, the **finished date** with Hijri, and the assignee read-only. No Resolve, Snooze or assignee picker |
| `queue/work-item-dialog.tsx` | **Read-only for finished items** (bug caught, below): no time-left chip on the due date, a **Finished** fact, and no Snooze, Resolve, Mark done or task editor. Open request stays, since it's only navigation |
| `gro/page.tsx`, `tasks/page.tsx` | Now redirects: `/gro` → `/queue?view=finished&kind=procedure`, `/tasks` → `/queue?view=finished&kind=task`. `tasks/new-task-dialog.tsx` stays, as the queue's New task form |
| `app-nav.tsx`, `header-location.tsx` | GRO and Task history leave "Other tools"; only Google Calendar remains, for DS-22c |
| `messages/{en,ar}.json` | `queue.view.*`, `viewLabel`, `summaryFinished`, `emptyFinished*`, `factFinished`. **Pruned:** `gro.*` keeps only `type` and `status`; `tasks.*` keeps only what the New task and work-item dialogs use; `nav.gro` and `nav.tasks` are gone |

## Live verification (web restarted)

**HR officer** (tasks own/assigned):

| View | Screen | SQL |
|---|---|---|
| `/en/gro` → | `/en/queue?view=finished&kind=procedure`, preset **Finished + Procedures**, "2 of 7 finished items" | 2 procedures completed or cancelled |
| All finished | **7** = October 2026 (6) + July 2026 (1) | 2 procedures + 3 requests + 2 of this officer's tasks = 7 |
| `/en/tasks` → | `/en/queue?view=finished&kind=task`, preset **Finished + Tasks**, "2 of 7" | 2 |
| Search "onboarding" | 2: "Cancelled: duplicate onboarding request", "Onboarding pack — Noura Alsubaie" | — |
| Switch back to **Open** | "26 of 26 items · grouped by deadline", bands as before | 26 (DS-17) |

**GRO officer:** procedures 2 · requests 3 · tasks **0**, 5 in all (SQL: 0 finished tasks own or assigned).

**Finished rows** show the finished date in the browser's local time: the July procedure was updated 25 Jul 20:40 UTC, which reads **26 Jul** locally.

**The dialog for finished items:**

| Item | Due | Finished | Actions offered |
|---|---|---|---|
| Exit/re-entry visa (completed procedure) | 15 Sep 2026 · Hijri, **no chip** | 3 Oct 2026 | Open record, Close |
| Collect signed contract (done task) | 24 Sep 2026 | 3 Oct 2026 | Close (**no task editor**) |
| Onboarding pack (resolved request) | 13 Sep 2026 | 3 Oct 2026 | Open record, Open request, Close |
| An **open** item, for contrast | — | — | Snooze seven days, Resolve, Close |

**Layout and locales:** Finished at `/ar` and `/en` × 1280 and 375 — 0px page overflow, one `h1`, no raw keys. Arabic: «5 من 5 عناصر منتهية · الأحدث أولًا», groups «أكتوبر 2026 / يوليو 2026».

**Gates:**
- Web typecheck and lint clean; prettier clean.
- **`next build` succeeds**: `/[locale]/queue` 6.34 kB; `/gro` and `/tasks` 311 B each (redirect only).

## Bug caught while verifying

**The work-item dialog treated finished work as open.** A completed procedure showed its due date as **"19d over"**, and every finished item offered **Snooze seven days**, which would have moved the due date of finished work. A done task also showed its status editor, which could reopen it. All three are now hidden for finished items, which get a "Finished" date instead.

## Notes

- The old GRO screen's own "new procedure" form went with it. Start a procedure remains on the Overview, the person record and the Client record.
- Rejected procedures are still **open** (a retry is possible) and appear in the queue's Open view, as before.
