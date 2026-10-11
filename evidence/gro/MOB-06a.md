# MOB-06a — Ready sequence steps as work items: data and API — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for both"). Owner decisions: one owner per run · a late step climbs the bell's ladder · the queue row opens the Mobilisation tab. ADR-018 rev. 2.

## What was built

**An owner per run.** `gro_sequences.assignee_user_id` (migration `20261019120000_gro_sequence_assignee`).

| Rule | How it is held |
|---|---|
| A new run's owner is the client's named officer | Only when the client names one and that person can still work procedures; otherwise nobody |
| It can be handed over, or cleared | `POST /gro-sequences/:id/assign` — needs `gro.process`, staff only |
| Only someone who works procedures can own one | The shared assignee rule (an active staff account holding `gro.process`); anyone else is refused with 400 |
| Only while the run is running | A completed or cancelled run is refused with 409 |
| The change is recorded and announced | Audited against the employee; the person handed the run is told — never about their own act, never on a re-save with the same owner |

**Ready steps in the calendar's data.** `GET /calendar/view` gains items of kind `step`: one per READY step of a running sequence, on its target date, owned by the run's owner, for readers of procedures (`gro.read`). A blocked step is not included; a filed one is not; a cancelled run has none.

**Ready steps in the bell's ladder.** The queue-deadline rule covers them: key `step:<run>:<step>`, due on the target date, owner = the run's owner. Staff only — a client manager's and an employee's ladder never carry one.

Files: `packages/contracts/src/sequence.ts`, `calendar.ts`, `escalation.ts`; `apps/api/src/modules/gro/` (sequences service, controller, module); `apps/api/src/modules/calendar/` (controller, `domain/calendar-view.ts`); `apps/api/src/modules/escalations/` (ladder + gathering); isolation and audit registries.

GRO now imports the Clients module (to read the named officer). Clients imports only Audit and Auth, so no loop.

## Tests

`apps/api/test/sequence-work-items.e2e-spec.ts` (12) and 4 rule tests in `escalation-ladder.e2e-spec.ts`. Written first.

| Run | Result |
|---|---|
| Before the code | **13 failed** |
| After | 47 passed in the two specs |

Each rule was then broken to see a test fail, and the file restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | A disabled officer still becomes the owner | yes |
| 2 | A new run gets no owner | yes |
| 3 | Anyone can be made the owner | yes |
| 4 | A finished run can be reassigned | yes |
| 5 | The owner is told again on a re-save | yes |
| 6 | The assign route has no staff check | yes — the test that grants a client role `gro.process` |
| 7 | The calendar shows blocked steps | yes |
| 8 | The ladder lists blocked steps | yes |
| 9 | The ladder lists steps of finished runs | yes |
| 10 | Calendar steps shown without `gro.read` | yes |
| 11 | Ladder steps shown without `gro.read` | yes |

One existing test changed on purpose: the sequences API's pinned response keys gained `assigneeUserId`.

Full API suite: **913/913** (897 + 16). API typecheck and lint clean.

## Not done in this card

- No screen shows any of it yet (MOB-06b).
- Reports' officer workload does not count steps.
- A run started before this card has no owner until someone takes it.
