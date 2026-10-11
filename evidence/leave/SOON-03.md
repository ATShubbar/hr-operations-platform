# SOON-03 — Service level on a leave request — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("let's work on the rest 3 points now"). Owner decision: "A setting, shown and
  measured".
- ADR-014 **rev. 2**.

## What it does

A leave request had shown "Service level · Soon". It now shows its service level and whether
it has been met.

- An Administrator sets the number of WORKING days in Settings → System (2 to start, 1 to 30).
- The clock runs from the day the request is submitted until PEOPLE&GRO files it, in the
  company's own working week. The employer's approval does not stop it.
- The line turns amber once the day to file by has passed with the request not filed, and stays
  amber on a request that was filed late.

| State | When | The line (English) |
|---|---|---|
| running | not filed; today is on or before the due day | Service level 2 working days · file by 13 Oct 2026 |
| overdue | not filed; the due day has passed | **Past its service level by 2 working days · was due 7 Oct 2026** |
| met | filed on or before the due day | Filed inside its service level of 2 working days |
| late | filed after it | **Filed 2 working days past its service level** |
| closed | declined or withdrawn | Service level 2 working days |

## How

- **Nothing is stored.** `leave/domain/leave-service-level.ts` is a pure function; the leave
  response gains `serviceLevel { days, dueOn, state, workingDaysOver }`, worked out when the
  request is read from the current setting, the company's `working.week` and the system timezone.
  The staff, client-manager and employee paths all go through the same presenter, so all three
  see the same thing.
- **A consequence of not storing it:** changing the setting re-measures every request at once,
  past ones included. Requests work differently on purpose — they store a due date because it can
  be moved by hand and is paused while detail is awaited; a leave request has neither.
- Setting `leave.service-level-days` (system level, whole number 1–30, default 2), changed with
  the existing `config.write` (Administrator). Leave now reads Configuration; no import loop
  (Configuration imports Audit and Clients only).
- No database change. No new permission.

## Tests — `apps/api/test/leave-service-level.e2e-spec.ts`

11 tests, written first: 10 failed; 1 passed vacuously and was given a real assertion.

| Red proof | Tests that fail |
|---|---|
| 1 The employer's approval stops the clock | 2 |
| 2 Calendar days, not working days | 3 |
| 3 Overdue ON the due day | 1 |
| 4 A filed request is judged by today, not by its filing day | 1 |
| 5 A declined request is still measured | 2 |
| 6 The setting is ignored | 1 |
| 7 The company's own week is ignored | **0 at first** — see below; 1 after the test was rewritten |
| 8 The setting takes any number | 1 |
| 9 "Today" is not taken in the system's timezone | 2 |
| Restored (three files byte-identical) | 11 / 11 |

**Proof 7 did not bite the first time.** The test compared "two working days from today" in two
working weeks, and today (a Sunday) gives the same date in both. It would have passed with the
company's week ignored. Rewritten on a FIXED Wednesday, where the two weeks give Sunday and
Friday; the proof then fails as it should.

API suite **942 / 942** (931 + 11). Lint, typecheck and build clean for every package.

## Sample data

The seed created every leave request "submitted today", so a fresh seed could never show an
overdue one. The seeded requests now have realistic submission and filing dates (`ago`,
`filedAfter` in `seedLeave`). On a fresh seed:

| Status / state | Count |
|---|---|
| pending / running | 3 |
| pending / overdue (waiting on the employer) | 1 |
| approved / overdue (waiting to be filed) | 1 |
| filed / met | 4 |
| filed / late | 1 |
| declined or withdrawn / closed | 2 |

## Checked on screen (local, 375px)

| Check | Result |
|---|---|
| The five lines, English | exactly the table above; overdue and late are amber, the others grey; no sideways overflow |
| Hand check of one | approved, submitted Mon 5 Oct → due Wed 7 Oct; today Sun 11 Oct → Thu 8 and Sun 11 are past it = 2 working days over |
| Arabic — overdue | «تجاوز مستوى الخدمة بمقدار يومَي عمل · كان مستحقًا في 7 أكتوبر 2026», amber, reads from the right |
| Arabic — late, running | «سُجِّل بعد مستوى الخدمة بمقدار يومَي عمل» · «مستوى الخدمة يومَا عمل · يُسجَّل حتى 13 أكتوبر 2026» |
| Settings → System, as Administrator | a "Leave service level" card with one box showing 2; Save disabled until it changes |
| Type 31 | "A whole number of days from 1 to 30."; Save disabled |
| Save 5 | every request now reads 5 days; the two overdue ones become running, the late one met |

The setting was put back to its default afterwards; the temporary authenticator cleared; the
database re-seeded.

## Not done

- **Leave is still not in the Work queue or the bell** (ADR-014). An overdue request is amber on
  the Leaves screen only.
- **No list marker.** The amber line is on the open request, not on the list beside it.
- The employee's own screen (My leave) uses the same component and the same field; it was covered
  by the API test, not looked at on screen in this card.
- Public holidays are not counted out (the same limit as request service levels).

## Files

`packages/contracts/src/leave.ts`, `index.ts`;
`apps/api/src/modules/leave/` (`domain/leave-service-level.ts` new, presenter, view, module,
public-api); `apps/api/src/modules/configuration/` (catalog, public-api);
`apps/api/prisma/seed.ts`; `apps/api/test/leave-service-level.e2e-spec.ts` (new);
`apps/web/src/app/[locale]/(app)/leaves/leave-detail.tsx`,
`settings/service-levels.tsx`, `settings/page.tsx`; `apps/web/messages/*.json`;
`adr/ADR-014-leave.md`.
