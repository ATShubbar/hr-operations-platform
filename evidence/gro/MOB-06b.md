# MOB-06b — Ready sequence steps on screen; sample data; smoke check — Evidence

- Date: 2026-10-11
- Status: **done** — closes MOB-06
- Card approved ("approved for both"). No API change (it uses MOB-06a).

## What changed

| Screen | Change |
|---|---|
| Work queue | A fourth kind, **Steps**: one row per ready step — the step's name, "person · company · Onboarding / Final exit", its target date with the Hijri date, the run's owner. A new "Steps" filter pill. The title and the "Open sequence" button lead to the person's Mobilisation tab |
| Work queue → owner picker | On a step it reads "Assign the whole sequence" and hands over the run, so all its steps move together |
| Calendar | Ready steps on their target date, in their own colour, with a legend entry. Clicking one opens the Mobilisation tab |
| The bell | "GAMCA medical cleared is due in 5 days" — and opens the Mobilisation tab |
| Mobilisation tab | An **Owner** control on a running sequence: a picker for those who run procedures, plain text for others |
| Overview | "Past due in queue" and "Needs you first" count steps, since they read the same queue |

No snooze on a step, and no work-item dialog: filing stays on the Mobilisation tab.

Files: `apps/web/src/app/[locale]/(app)/queue/` (items, actions, row, page, finished-row), `calendar/` (page, views, cal-utils), `overview/` (page, needs-row), `employees/[id]/mobilisation-tab.tsx`, `components/notification-centre.tsx`, `messages/*.json`; `apps/api/prisma/seed.ts`; `apps/api/scripts/uat-smoke.mjs`.

## Checked on screen (local, as HR officer)

**Work queue, Steps filter** — four rows, matching the database's three running sequences:

| Step | Person · company · kind | Target | Owner |
|---|---|---|---|
| GAMCA medical cleared | Maria Santos · Gulf Medical Group · Onboarding | in 5 days | Unassigned |
| Iqama issued | Bilal Ahmed · Najd Logistics Co. · Onboarding | in 6 days | Turki (GRO officer) |
| GOSI deregistration | Kamal Uddin · Beta Contracting Est. · Final exit | in 6 days | Omar (HR officer) |
| Contract closed on Qiwa | Kamal Uddin · Beta Contracting Est. · Final exit | in 6 days | Omar (HR officer) |

| Step | Result |
|---|---|
| Owner picker on the GAMCA row | Heading "Assign the whole sequence"; six people, all Administrators, HR or GRO officers |
| Pick Huda Al-Qahtani | Toast "Reassigned to Huda Al-Qahtani."; the row shows Huda; the run's owner in the API is Huda |
| Calendar (Arabic) | «اجتياز فحص GAMCA الطبي», «إصدار الإقامة», «إلغاء تسجيل التأمينات», «إغلاق العقد في قوى» on their dates; legend «خطوة تهيئة أو خروج»; no untranslated key; no duplicate-key warning (two steps of one run share a day) |
| Click the GAMCA chip | Opens Maria Santos's record on the Mobilisation tab |
| Mobilisation tab → Owner → "Nobody yet" | Toast «لم يعد لهذا الملف مسؤول.»; the run's owner in the API is empty |
| The bell → Everything | "GAMCA medical cleared is due in 5 days · Maria Santos · Gulf Medical Group · Unassigned · queue deadline · 5d left" |
| Phone width (375), Arabic, queue | Page overflow 0; the five kind pills fit on one line (280 of 343 px) |

Web typecheck, lint and production build clean. API suite 913/913.

## Sample data

Each seeded run now has an owner: Bilal Ahmed's onboarding the GRO officer, Kamal Uddin's final exit an HR officer, Maria Santos's onboarding nobody (so the queue shows work nobody has taken).

| HR officer, clean seed | Before | After |
|---|---|---|
| Items on the ladder | 34 | **35** (Maria's GAMCA step, 5 days out, at Notice) |
| Needing action | 19 | 19 |
| Quiet | 7 | 7 |

The other three ready steps are 6 days out, just outside the queue rule's 5-day window. They enter the ladder tomorrow, as the days run down.

## Smoke check

Two new checks, both passing against the local servers along with all the others:

- sequence steps: every ready step is in the calendar, and runs carry an owner (3 running, 4 ready steps, 4 in the calendar)
- sequence steps: the bell lists only ready steps, under the queue rule

The walk-through's changes and the smoke run's leftovers were removed and the database re-seeded.

## Not done

- Reports' officer workload does not count steps.
- The Overview's "Needs you first" was not seen holding a step: the sample steps are days ahead and its five places go to work that is already late. It reads the same list as the queue.
- No automated test for the screens; the API rules are covered in MOB-06a.

## For UAT

Run **Seed UAT (seed-and-smoke)** after `/api/health` shows this commit. Runs already on UAT keep no owner until the seed replaces them.
