# DEP-06b — A dependant's iqama renewal: screens, sample data, smoke check — Evidence

- Date: 2026-10-11
- Status: **done** — closes DEP-06 and the dependants work
- Card approved ("approved for both"). No API change (it uses DEP-06a).

## What changed

**Family tab (Person record).**

- A dependant's ⋯ menu gains **Start iqama renewal** for anyone who may run procedures. A short dialog says what it does; confirming opens the procedure on the sponsor, due on the day the iqama lapses.
- While a renewal is open for a dependant, their iqama row shows **Renewal open** — a link to that item in the work queue — in place of the Renew button. Completing the procedure is what records the new date, so the two cannot disagree.
- The menu entry is not offered while one is open. If two people start one at the same moment, the second sees "A renewal is already open for this dependant".

**Wherever a procedure is listed** (Work queue, the work-item dialog, a person's and a client's Open work, the completion dialog): a dependant procedure is titled with the dependant's name — "Dependant iqama renewal · Yasmin Hassan". The queue's search finds it by that name.

**Completion dialog.** Asks for the new expiry and says it goes to the dependant's record. The fee is prefilled with the annual dependant fee, paid to Muqeem.

Files: `apps/web/src/app/[locale]/(app)/employees/[id]/family-tab.tsx`, `queue/queue-items.ts`, `components/gro-work-list.tsx`, `lib/procedure-title.ts` (new), `lib/gro-workflow.ts`, `lib/fees.ts`, `messages/*.json`; `apps/api/prisma/seed.ts`; `apps/api/scripts/uat-smoke.mjs`.

## Checked on screen (local)

**As GRO officer, on Ahmed Hassan's Family tab**

| Step | Result |
|---|---|
| Open the tab | Omar Hassan (seeded renewal open): iqama row shows "Renewal open → /queue?open=procedure-…", no Renew. Yasmin Hassan: Renew is offered |
| Yasmin's ⋯ → Start iqama renewal | Dialog: "Start an iqama renewal for Yasmin Hassan? It becomes a work item on Ahmed Hassan's record. While it is open, the reminder for this iqama stays quiet; completing it records the new expiry." |
| Start renewal | Toast "Iqama renewal started for Yasmin Hassan." Created `not_started`, due 25 Nov 2026 (the day her iqama lapses). Her row now shows "Renewal open"; no Renew button is left on the tab |
| Work queue (Arabic) | «تجديد إقامة مُعال · عمر حسن» and «تجديد إقامة مُعال · ياسمين حسن». Page overflow 0 |
| Open work → Resolve → Completed | Dialog "Complete Dependant iqama renewal · Yasmin Hassan — Completing it writes the new expiry to the dependant's record." Amount prefilled **4,800**; paid to **Muqeem** |
| Enter 25 Nov 2027 → Complete | Procedure completed. Yasmin's iqama: 25 Nov 2027. Omar's unchanged; Ahmed's own iqama unchanged. Fee `GF-1479`, SAR 4,800, Muqeem, recorded |

The three status moves before "Completed" were made through the API; the completion was through the screen.

**As the client manager of the same company**

- Their procedures list: 200, **5** procedures (the company has 7 including the two dependant renewals), none of the dependant type, none naming a dependant.
- Reading the seeded dependant renewal by its id: **404**.

**Phone width (375), Arabic, as HR officer:** the Family tab has no overflow; the «تجديد قيد الإنجاز» link sits inside its card.

Web typecheck, lint and production build clean. API suite 897/897 (unchanged).

## Sample data

One open renewal: Omar Hassan's iqama (Ahmed Hassan's son), reference MUQ-2026-D0142, in progress, due in 10 days, with the GRO officer.

| HR officer, clean seed | Before | After |
|---|---|---|
| Items | 35 | **34** (Omar's iqama reminder is quiet; the renewal is 10 days out, outside the queue's 5-day window) |
| Needing action | 19 | 19 |
| Quiet | 6 | **7** |

## Smoke check

Two new checks, both passing against the local servers along with all the others:

- dependant renewal: staff see it named, and its iqama is quiet
- dependant renewal: hidden from the client manager of the same company (their list has procedures, none of this type; by id → 404)

The second runs on UAT as the real client login, so the database fence is proven there, not only locally.

The walk-through's and the smoke run's leftovers were removed and the database re-seeded.

## Not done

- Insurance and passport have no procedure (owner decision); they keep the Renew button.
- The generic "Start a procedure" dialog does not offer this type: it has no way to choose a dependant. The Family tab is the one place to start it.
- The Calendar and the bell show this procedure by its type only, without the dependant's name (their data does not carry it).
- No automated test for the screens; the API rules are covered in DEP-06a.

## For UAT

Run **Seed UAT (seed-and-smoke)** after `/api/health` shows this commit.
