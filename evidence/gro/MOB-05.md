# MOB-05 — Final exit ends the employment; "Mobilisations and exits" panels; seeded sequences — Evidence

- Date: 2026-10-10
- Status: **done** — the last card of the onboarding / final-exit epic (MOB-00..05, ADR-018).
- Card approved by the owner in session ("approved").

## What changed

| Area | Change |
|---|---|
| GRO service | `SequencesService.afterCompletion` gains the final-exit branch: when the last step ("Departure confirmed, iqama cancelled") is filed and the person is not already terminated, GRO calls `EmployeesService.update(…, { employmentStatus: 'terminated' }, 'terminate')`. This is the same direct call onboarding completion uses (ADR-018 rev. 1). Employees then publishes the existing termination event, which closes any self-service account. |
| GRO API | **`GET /gro-sequences?status=`** (`gro.read`, staff only through `scopeOf`). Defaults to `running`; an unknown status is 400. Each run is the existing response plus `clientId` and `employee { id, name { ar, en } }`. Oldest first. Registered in the isolation registry as `staff`. |
| Contracts | `sequenceStatusQuerySchema`, `sequenceInFlightSchema`, `sequenceInFlightListResponseSchema`. |
| Web | New shared `components/sequences-panel.tsx`, the prototype's panel: avatar, "Name · Onboarding", "Company · next: step", "N of M filed", percentage, progress bar (amber for an exit, ink for a mobilisation). Each row is a real link to `/employees/:id?tab=mob`. It loads its own list and renders nothing for a viewer without `gro.read`. It replaces the "coming soon" placeholder on the **Overview** and is added to the **Reports** dashboard after "Open procedures by type", where the prototype has it. |
| Web, Mobilisation tab | The Mark-filed dialog warns before the step that completes a final exit: "Filing this ends {name}'s employment. Their record stays as history and any self-service account is closed." The toast for that filing says the exit is complete and the employment has ended. The record's header refreshes. |
| Seed | Three sequences in flight, dates relative to seed day: Bilal Ahmed (Najd Logistics, onboarding, 6 of 11, next: iqama), Maria Santos (Gulf Medical, onboarding, 2 of 11, next: GAMCA) and Kamal Uddin (Beta Contracting, final exit, 3 of 8). The two onboardings are **new** sample hires in status `onboarding`, each with a candidate in `mobilisation` linked to them. Re-seeding replaces the seeded runs and clears stale candidate links. |

## Tests

`test/gro-sequences-api.e2e-spec.ts`, two new tests, both written first and seen red (`2 failed | 8 passed`):

- **The list.** `GET /gro-sequences` returns only running runs; row keys are the run's keys plus `clientId` and `employee`; `employee` keys are exactly `id` and `name`. A real client manager gets 403, an employee 403, anonymous 401, `?status=nonsense` 400.
- **Final exit terminates.** The employee signs in and reads `/me` (200). Staff start a final exit and file all eight steps. Then: the employee is `terminated`; exactly one `employee` / `terminate` audit entry; **the same session's `/me` is now 401**; reopening the last step is 409; the run is no longer in the running list.

**Deliberately changed existing test** (`gro-sequences`, MOB-01): the completion test ended by starting a second final exit for the same person "to prove the slot is freed". That person is now terminated, so the test asserts the termination and that a new start is refused (400). The freed slot is still proven by the onboarding test beside it.

**Red proofs** (each piece disabled, tests fail, file restored byte-identical with `cmp`):

| Disabled | Failed |
|---|---|
| The termination on final-exit completion | 2 (the new test and the changed MOB-01 test) |
| The staff check on the list route | 1 (a client manager read it) |
| The status filter on the list | 2 |

**Gates:** full API suite **740/740, twice** (738 + 2). API and web `typecheck` and `lint` clean. `next build` succeeds (dev server stopped).

## Live (dev servers restarted; data re-seeded first)

| Check | Result |
|---|---|
| Overview panel, HR officer, English | Three rows: "Bilal Ahmed · Onboarding / Najd Logistics Co. · next: Iqama issued / 6 of 11 filed / 55%"; "Kamal Uddin · Final exit / Beta Contracting Est. · next: GOSI deregistration / 3 of 8 filed / 38%"; "Maria Santos · Onboarding / Gulf Medical Group · next: GAMCA medical cleared / 2 of 11 filed / 18%". Bar fills: ink, amber `rgb(217, 119, 6)`, ink, at widths 55% / 38% / 18%. Links go to each person's `?tab=mob`. |
| Headcount with the two new hires seeded | **35**, unchanged (people onboarding are not under management). The employee list is 39 → 41. |
| Arabic at 375px | Panel 343px wide, 0px page overflow, nothing escaping the card, no truncated line. |
| Arabic reading order, measured with text ranges | Name (x 130–180) sits to the right of the kind (72–120); company (245–284) to the right of "التالي" (131–151); "GAMCA" (98–139) to the left of «فحص» (142–168). So each line reads name-first from its right edge and the Latin word stays in place. |
| File the second-to-last exit step (ticket) in the UI | No warning in the dialog. |
| Open the last step's dialog | Warning shown, English and Arabic, inside the 343px dialog, 0px overflow. |
| File it | Header **Active → Terminated with no reload** (navigation entries unchanged). Toast: the exit is complete and the employment has ended. 0 Reopen buttons, 0 Start buttons. History, newest first: `terminate` (employee), `complete` (sequence), then the filed steps, all named "Omar Al-Shehri". |
| Afterwards | Overview headcount **35 → 34**; the panel shows two rows. |
| Reports, Administrator | Panel present after "Government fees by client" / "Open procedures by type" and before "Detailed reports"; two rows; one `h1`; 0px overflow. At 1280px a row is 58px tall with a 160px progress block, as in the prototype. |
| Empty state (running runs cancelled by SQL for the check) | «لا توجد ملفات قيد التنفيذ. ابدأ واحدًا من سجل الموظف.», no rows. |
| Hiring board with the seed | Both seeded hires are in Visa & mobilisation: "2 of 11 filed" and "6 of 11 filed", each with **Open onboarding** to their Mobilisation tab. |

## Defects caught while verifying, fixed

1. **Arabic panel lines.** I had isolated only the name, which cuts an Arabic line into separate runs laid out left to right. Each line is now one isolated run; the measured order is in the table above. I have no measurement of the first version, only a screenshot.
2. **The warning was amber text on an amber tint**, hard to read for a full sentence. It now uses the app's existing warning banner: tinted surface, ring, icon, normal text colour.

## Data

- Administrator sign-in for the Reports check needed an authenticator: the seed account was enrolled for the check and the secret cleared afterwards (0 enrolled accounts, confirmed by SQL).
- The exit completed during the check, and the runs cancelled for the empty-state check, were restored by re-seeding: Kamal Uddin `active`, three runs `running`, 41 employees. That also shows the seed resets a completed or cancelled seeded run.

## Not done here

- **UAT shows the seeded files only after the owner runs Seed UAT** (GitHub → Actions → Seed UAT → `seed-and-smoke`). It resets UAT's data and the seed accounts.
- Seeded runs have no audit entries, so their steps do not appear in the person's History until someone files one. The same is true of every other seeded record.
- Seeded candidates show "Added today" on the board on a first seed (their created date is the seed time).
- A viewer with no `gro.read` gets no panel. Every staff role holds it today, so that branch was not exercised live.
