# MOB-04b — The Hiring board's Visa & mobilisation column becomes real — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-018, and **rev. 1**, written in this card.

## Owner decisions (asked; answers recorded)

| Question | Answer |
|---|---|
| A non-Saudi at Offer may move to… | **Either** (recommended): Visa & mobilisation, or straight to Onboarded |
| Is a completed onboarding still reopenable? | **No, completed is final** (recommended). This changes MOB-01's tested behaviour. |
| The hire date when onboarding completes | **Arrival date** (recommended): the "Ticket booked and arrival logged" step's filed date, only if none is on file |
| The MOB-04b card | **approved** |

## A design conflict found before coding, and how it was resolved (ADR-018 rev. 1)

ADR-018 had GRO publish `OnboardingCompletedEvent` for Employees and Recruitment to subscribe to. The import edges were checked first:
- `employees → recruitment` (the hire events);
- `gro → employees`.

Either new subscription would close a loop (GRO → Employees → Recruitment → GRO) that the module loader cannot resolve. **The behaviour the owner approved is unchanged; the wiring is:**

1. Recruitment publishes `CandidateMobilisingEvent`, carrying the **employee id it minted** and stored on the candidate.
2. Employees creates the record as `onboarding` with that id and publishes `EmployeeMobilisingEvent`.
3. GRO starts the onboarding sequence.
4. On completion, **GRO calls `EmployeesService` directly** (the GRO-03 pattern, for the same reason): the person becomes `active`.
5. Employees publishes `EmployeeJoinedEvent` (onboarding → active).
6. Recruitment carries the candidate to `hired`. It subscribes **by name** (`employee.joined`), since it cannot import Employees; a test pins the name and payload.
7. Withdraw or reject: Recruitment publishes `CandidateMobilisationEndedEvent`; Employees terminates. MOB-04a's handler then cancels the onboarding.

This was raised with the owner in the session before coding, and is recorded in ADR-018 and `adr/README.md`.

## What changed

| Area | Change |
|---|---|
| Database | `CandidateStage` gains `mobilisation` (own migration). `rec_candidates.employee_id` (unique) + CHECK: stage `mobilisation` ⇒ `employee_id` present. |
| Recruitment | Workflow: `offer → mobilisation / hired / interview / rejected / withdrawn`; `mobilisation → rejected / withdrawn` only. `changeStage`: mobilisation needs a nationality and refuses a Saudi national (400); it mints the employee id in the same transaction; it publishes the two events after commit. `completeMobilisation(employeeId)` is the one system move (`mobilisation → hired`): audited, publishes no hire event, a no-op when nothing matches. `EmployeeJoinedHandler` subscribes by name. |
| Employees | `CandidateMobilisationHandler` (create as `onboarding` if absent, then announce; terminate on "ended" only if still `onboarding`). `EmployeesService.update` publishes `EmployeeJoinedEvent` on onboarding → active. Two new events. |
| GRO | `EmployeeMobilisingHandler` starts onboarding (a 409 "already running" is ignored). `SequencesService.file` runs `afterCompletion` post-commit: if the person is still `onboarding`, set `active` + hire date = the `travel` step's date when none is on file (audited `onboarding-complete`). **A completed sequence cannot be reopened, for either kind.** |
| Contracts | `candidateStageSchema` + `mobilisation`; candidate response + `employeeId`; `vacancyPipelineSchema` + `mobilisation`. |
| Counts | Vacancy pipeline counts and the recruitment report (a "Visa & mobilisation" column; "in pipeline" includes it). |
| Web | `hiring/stages.ts`: six real columns, `forwardOf(stage, nationality)`, nationality-aware `canDrop`. Board: the column is a drop target with a count; **both** moves that create an employee ask first; a mobilising card shows "N of 11 filed" + **Open onboarding** (to the person's Mobilisation tab), and is not draggable. Offer cards: "To visa & mobilisation" + "Onboard directly" for a non-Saudi, the direct move only for a Saudi. Candidate dialog: real Mobilisation fact, Open onboarding, Not progressing only. Pipeline bars and the client Overview count mobilisation. Mobilisation tab: no Reopen on a completed run; the record's header refreshes when a completion changes the status. |

## Tests

**`test/hiring-mobilisation.e2e-spec.ts`**, 10/10:
- **The whole chain.** Mobilise → the employee exists as `onboarding`, no hire date → onboarding `running` → every step filed → sequence `completed` → employee `active`, **hire date = the arrival step's date** (3 days ago) → candidate `hired` → **exactly one employee** → reopen of the completed run gives 409.
- A hire date already on file is kept.
- A Saudi national: mobilisation gives 400; the direct hire works, with no sequence.
- A non-Saudi hired directly: `active`, no sequence.
- No nationality: mobilisation gives 400, nothing created.
- From mobilisation, by hand: `hired`, `offer` and `mobilisation` all give 400.
- Withdraw and reject each: employee `terminated`, sequence `cancelled`.
- An onboarding started by hand for an active person changes neither status nor hire date.
- Pipeline counts include mobilisation.
- The by-name contract: `EMPLOYEE_JOINED === EmployeeJoinedEvent.NAME`, and the event's keys are pinned.

**Deliberately changed existing tests:**
- `gro-sequences` (MOB-01): "a completed onboarding may be reopened" became "…is final as well" (409, no reopen audit).
- `recruitment-vacancy-pipeline`: five counts became six.

**Red proofs** (each link broken, tests fail, then restored byte-identical):

| Broken | Failed |
|---|---|
| Recruitment doesn't announce mobilising | 5, incl. the chain |
| Employees doesn't announce the new record | 4 |
| GRO's completion effect disabled | 3 |
| Employees doesn't announce "joined" | 2 (the candidate never reaches `hired`) |
| Hire date = today instead of the arrival step | 1 |
| Saudi check removed | 2 |
| `mobilisation → hired` allowed by hand | 2 |
| Withdraw/reject not announced | 1 |
| Completed sequences reopenable again | 1 |

The first attempt at the withdraw/reject proof didn't apply: the line was wrapped differently, and the replace asserted and stopped, so nothing ran falsely green. It was redone against the real text.

**Gates:** full API suite **738/738, twice**. API + web `typecheck` and `lint` clean. **`next build` succeeds** (dev server stopped).

## Live (HR officer; dev servers restarted)

| Check | Result |
|---|---|
| The column | "Visa & mobilisation 0", "Drop a candidate here". At Offer: Gracia Reyes (PH) and Imran Khan (PK) each offer **To visa & mobilisation** + **Onboard directly**; the two Saudi candidates offer only **Move forward**. |
| Move Imran Khan in | Confirm "Start visa & mobilisation for Imran Khan? This creates Imran Khan's employee record at Najd Logistics Co. and starts their onboarding sequence. They are not counted in headcount until onboarding completes. It can't be stepped back — only withdrawn." **0 requests before confirming**, then `POST /candidates/:id/stage {"stage":"mobilisation"}`. |
| His card | In the column: "0 of 11 filed", **Open onboarding** → `/employees/<id>?tab=mob`, not draggable, no move buttons. |
| His record | `onboarding`, no hire date; list 39 → 40, **in post still 36**; sequence started by "Omar Al-Shehri". |
| File the last step on his Mobilisation tab | Employee **`active`**, hire date **2026-10-07** (the arrival step, filed 3 days earlier), candidate **Onboarded**, **1** record named Imran Khan, in post **36 → 37**. |
| A second hire, watched on the record (Rajesh Kumar) | Filing the last step flips the header label **Onboarding → Active with no reload** (navigation entries unchanged, tab still open), and the completed run shows **0 Reopen**. |
| Board afterwards | Onboarded: Imran Khan, Fatimah Alzahrani, Rajesh Kumar. |
| Withdraw Gracia Reyes mid-mobilisation (1 step filed) | Dialog: Stage "Visa & mobilisation", Mobilisation "0 of 11 filed"; buttons Not progressing / Open onboarding / Close. After "Withdrew": off the board, candidate `withdrawn`, employee **`terminated`**, sequence **`cancelled`** (its filed step kept), in post unchanged at 38. |
| `/ar/hiring` at 375 | «التأشيرة والاستقدام», «أفلت مرشحًا هنا», 0px overflow. |

## Defects caught while verifying, fixed

1. **A completed onboarding still showed 11 Reopen buttons.** The tab kept MOB-03's rule; the server would have refused each. Now only a running sequence offers Reopen.
2. **The record's header stayed "Onboarding" after the completion** until a reload. The tab now tells the page to refresh the person when a run completes.

## A mistake of mine during verification

A too-loose selector (`ul button` matching "Withdr…") clicked **Withdraw on an open role** in the strip above the board, not on the candidate, and cancelled the seeded "Registered Nurse" vacancy. This was dev data only. The candidate withdrawal was redone with an exact selector, and the re-seed restored the vacancy (`Registered Nurse: open`, confirmed by SQL).

## Data

The three walk-through hires (two completed, one withdrawn) and their sequences were deleted on the owner connection, and the candidates' `employee_id` cleared. After re-seeding: 39 employees, 0 sequences.

## What a broken link looks like, as promised

The bus isolates failures, so a failed later link leaves earlier ones standing:
- **Candidate in Visa & mobilisation with no employee record:** Employees' create failed. Withdraw the candidate and re-add them.
- **Employee `onboarding` with no sequence:** GRO's start failed. Start onboarding by hand on their Mobilisation tab; its completion activates them as normal.
- **Completed onboarding, person still `onboarding`:** the activation failed (logged as an error by `SequencesService`). Start and complete a new onboarding by hand.
- **Person active, candidate still in mobilisation:** Recruitment's handler failed. The candidate can be withdrawn; nothing else depends on it.
