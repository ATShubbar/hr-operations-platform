# DEP-07 — The calendar and the bell name the dependant — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved in the clean-up batch ("approved for all 6").

## The gap

DEP-06 made a dependant's iqama renewal a procedure on the sponsor. The Work queue and its dialog
named the dependant; the Calendar chip and the bell item said only "Dependant iqama renewal" and
the sponsor — so two renewals for one family could not be told apart.

## What changed

| Where | Change |
|---|---|
| `GET /calendar/view` | A procedure item carries `dependant: { nameEn, nameAr } \| null`. Every other item carries `null` |
| `GET /escalations` | A procedure subject carries `dependant: { name: { en, ar } } \| null` |
| Calendar (web) | The item's title reads "Dependant iqama renewal · Omar Hassan" (one title function feeds the chip, the day panel and the agenda; the chip was the one checked on screen) |
| The bell (web) | "Dependant iqama renewal · Omar Hassan: due in 2 days", the sponsor on the line below |

Who sees it: staff only. Client managers have no calendar, and neither their ladder nor an
employee's holds procedures, so the name reaches nobody who could not already open the Family tab.
The name of a removed dependant still resolves (a procedure outlives a removal only until the
removal cancels it).

Files: `packages/contracts/src/calendar.ts`, `escalation.ts`;
`apps/api/src/modules/calendar/` (controller, `domain/calendar-view.ts`);
`apps/api/src/modules/escalations/` (service, `domain/ladder.ts`);
`apps/web/src/app/[locale]/(app)/calendar/page.tsx`, `components/notification-centre.tsx`.

## Tests

One test added to `test/gro-dependant-renewal.e2e-spec.ts`, written before the code: "the
calendar and the bell name the dependant". It also checks that an ordinary procedure on the same
day names nobody, in both places.

| Red proof | Result |
|---|---|
| The calendar passes no name | The test fails |
| The ladder passes no name | The test fails |
| Restored (byte-identical) | 8 / 8 |

API suite: **921 / 921** (with MOB-07's seven).

## Checked on screen (local, as the GRO officer who owns the seeded renewal)

The seeded renewal is due in 10 days, which is before the queue rule's first stage; its due date
was moved to two days out for the check and put back afterwards.

| Screen | Result |
|---|---|
| Calendar, English | Chip "Dependant iqama renewal · Omar Hassan" |
| Calendar, Arabic | «تجديد إقامة مُعال · عمر حسن» |
| The bell → Assigned to me, Arabic | «تجديد إقامة مُعال · عمر حسن: الموعد خلال يومين» · sponsor «أحمد حسن» · «شركة الألف التجارية» · «باقٍ يومان»; the title fits its row |
| `GET /escalations` | The item is at Reminder with `dependant.name.en = "Omar Hassan"` |

A Reminder-stage item is under "Assigned to me" and "Everything", not "Needs action" — that tab
is Escalated and Breach only (NC-02).
