# DEP-06a — A dependant's iqama renewal as a procedure: data and API — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for both"). Owner decisions: iqama only · one procedure per dependant · the fee prefill is the annual dependant fee. ADR-017 rev. 2.

## What was built

A new procedure type, **Dependant iqama renewal**, opened on the sponsoring employee and naming one dependant.

| Rule | How it is held |
|---|---|
| Names one current dependant of that employee | The service checks it (another sponsor's, a removed one and an unknown id are all "not found"). The contract and a database CHECK tie the type to a named dependant, both ways |
| One renewal in flight per dependant | A partial unique index; a second one is refused with 409. A new one may start after the first is completed or cancelled |
| While open, that dependant's iqama is quiet | The ladder's rule, by dependant id — for staff and for the sponsor's own ladder |
| Completing writes the new date to the dependant | Through the dependants service, audited against the sponsor |
| Removing a dependant cancels their open renewal | Employees publishes `DependantRemoved`; GRO subscribes |
| Fee prefill | `standardProcedureFee` returns the annual dependant fee for this type; there is no second figure |
| **A client never sees one** | A RESTRICTIVE database policy hides these rows from the client connection |
| Permissions | Unchanged: `gro.process` starts and completes |

Staff responses carry `dependant: { id, nameEn, nameAr }` (null for every other procedure).

Files: migrations `20261018120000_gro_type_dependant_iqama_renewal`, `20261018130000_gro_process_dependant`; `packages/contracts/src/gro.ts`, `escalation-rules.ts`, `billing-lists.ts`; `apps/api/src/modules/gro/` (service, controller, effects, `dependant-removed.handler.ts`); `apps/api/src/modules/employees/` (`dependants.service.ts`, `domain/dependant-removed.event.ts`); `apps/api/src/modules/escalations/` (ladder + mapping).

## Why the client fence is in the database

Every read a client makes of procedures goes through one connection (`app_client`). A policy on the table hides dependant procedures from that connection whatever the query is: the list, a read by id, the client's own notification ladder. A filter in each query would hold only until someone wrote a query without it.

The check, as the client manager of the company:

- Their list holds the ordinary procedure of the same employee, and nothing else.
- The response text contains neither the type's name nor the dependant's id.
- Reading a dependant procedure by its id returns 404.
- Staff see all of them, named.

## Tests

`apps/api/test/gro-dependant-renewal.e2e-spec.ts` (7), one rule test in `escalation-ladder.e2e-spec.ts`, two unit tests in `packages/contracts/src/billing-lists.test.ts`. Written first.

| Run | Result |
|---|---|
| Before the code | 7 failed. "The database ties the type to a dependant" passed, for the wrong reason (the column did not exist yet) |
| After | 38 passed in the two API specs; contracts 34 |

Each rule was then broken to see a test fail, and restored (files compared byte for byte; database objects re-created and the schema compared against the migrations):

| # | Broken | Failed as expected |
|---|---|---|
| 1 | The database policy hiding them from clients removed | yes |
| 2 | The database CHECK removed | yes (2 tests) |
| 3 | The one-open-per-dependant index removed | yes |
| 4 | Any sponsor's dependant accepted | yes |
| 5 | A removed dependant accepted | yes |
| 6 | Completion writes nothing to the dependant | yes |
| 7 | Removal cancels nothing | yes |
| 8 | A renewal quiets every dependant of the sponsor | yes (2 tests) |
| 9 | An open renewal quiets nothing | yes (2 tests) |

Full API suite: **897/897** (889 + 8). API typecheck and lint clean; web typecheck clean.

## Not done in this card

- No screen starts or shows one yet (DEP-06b): the Family tab, the queue and the completion dialog.
- No sample data or smoke check yet (DEP-06b).
- A completed renewal whose dependant was removed in the same moment writes nothing and logs a warning. Removal cancels an open renewal first, so this needs two people acting within the same second.
