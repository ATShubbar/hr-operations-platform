# HIST-01 — Details in a person's History — Evidence

- Date: 2026-10-12
- Status: **done**
- ADR-022 (rev. 1). Card approved in advance ("approved for all 5"). Owner decision: History
  shows details "same as the record".

## What it does

Each event in a person's History now lists what changed, old → new, under its line:

    Pay updated                      12 Oct 2026 · 11:22 PM
    Omar Al-Shehri · HR officer
      Basic salary        7,000 → 12,500
      Housing allowance   1,750 → 3,100

A reader who may not see a kind of detail still sees the event, with a line saying what was
left out:

    Pay updated                      12 Oct 2026 · 11:22 PM
    Omar Al-Shehri · HR officer
    Pay details changed here; they are not shown for your role.

## Who sees what

One rule, `apps/api/src/modules/history/domain/history-details.ts` → `detailsFor(entry, can)`.
The server cuts each entry before it leaves; the page is sent nothing it must not show.

| Detail | Needs | Today that means |
|---|---|---|
| Pay fields (9, bank account included) | `salary.read` | everyone but the GRO officer |
| Government-data fields (17 — numbers AND dates) | `govdata.read` | every staff role |
| A dependant's iqama number | `govdata.read` | every staff role |
| A self-service account's details (the email) | `employee-user.read` | not the GRO officer |
| A document's, a procedure's, a sequence's details | the permission that reads it | every staff role |
| A kind of record nobody has decided about | — | shown to nobody |

Three points settled while building (ADR-022 rev. 1):

- Without `govdata.read` the **dates go with the numbers**, because that is what the record
  itself does for a staff reader — the group is seen whole or not at all.
- An **account's details** follow `employee-user.read`: the Self-service card is hidden from
  the GRO officer on the record, so its email is hidden from them in History too.
- Ids that only locate a row (`dependantId`, `sequenceId`) are stripped for every reader.

The pay and ID field lists live with the record (`SALARY_FIELDS`, `GOVDATA_FIELDS` in
`employees/domain/employee-view.ts`); a test holds them equal to the groups the record's own
response uses, so a field added to one cannot be missed in the other.

## Changed

- Contract: `personHistoryEntrySchema` = the history entry + `before`, `after`, `withheld`.
  A request's decision trail keeps the plain entry — it shows no values, as before.
- `AuditQueryService.forRecords` hands the entry's two sides to its caller.
- `EmployeeHistoryController` cuts them with `detailsFor`.
- Web: the History tab lists the changes with the same component as the Audit trail
  (`ChangeList`), and a line per kind withheld.

## Tests — `apps/api/test/employee-history-details.e2e-spec.ts` (12)

Written before the code. They could not run before it (they import the rule and the field
lists), so the red proofs below are what shows each one bites.

- the rule itself (5): an undecided kind shows nothing; no record permission, no details;
  each kind withheld is named once; locator ids never leave; one-sided entries stay one-sided;
- full access (HR officer, Auditor): every change, old and new, pay and ID values included;
- the **GRO officer** (a real role): pay withheld from the pay edit AND from the creation entry
  that holds everything at once; the invitation's email withheld; nothing withheld appears
  anywhere in the response;
- **narrowed policy** (no real staff role lacks `govdata.read`): the ID edit withheld whole,
  a dependant keeps everything but the number;
- the field lists equal the record's groups.

Three older tests pinned the old rule and were rewritten on purpose:
`employee-history.e2e-spec.ts` (entry keys; "never before/after"),
`dependants-api.e2e-spec.ts` ("no identifier" in History).

| Red proof | Tests that fail |
|---|---|
| 1 Pay shown to a reader who cannot read pay | 3 |
| 2 ID fields shown without `govdata.read` | 2 |
| 3 A dependant's iqama number shown without `govdata.read` | 1 |
| 4 An account's details shown to everyone | 2 |
| 5 What was withheld is not reported | 3 |
| 6 An undecided kind of record shows everything | 1 |
| 7 The record's own read permission is not asked | 1 |
| 8 The bank account not counted as pay | 4 |
| 9 Without `govdata.read` only the numbers go, the dates stay | 2 |
| 10 The controller hands over the entry uncut | 4 |
| 11 Locator ids ride along | 3 |
| Restored from the staged copy, tree clean after each | all pass |

## On screen (local)

Made four edits to Ahmed Hassan as the HR officer.

- **HR officer, English, 1280px.** Each of the four events lists its changes: department and
  job title; basic salary 7,000 → 12,500 and housing 1,750 → 3,100; iqama expiry in both
  calendars and passport number — → P7654321; the dependant's passport expiry. 0px overflow.
- **GRO officer, Arabic, 375px.** The same events; the pay event reads «تغيّرت هنا بيانات
  الراتب؛ وهي لا تُعرض لدورك» and none of the four amounts appears anywhere on the page. The ID
  and profile changes show, old on the right and «←» to the new. 0px overflow; no change list
  wider than its box.

Sample data put back (re-seeded, plus the one value the seed does not rewrite).

## Checks

- API suite **990 / 990** (978 + 12). `pnpm turbo run lint typecheck build` — 15 / 15.

## Stated

- Events from before 12 Oct 2026 list few or no changes: the values were not recorded then. The
  tab says so at its foot.
- A new record's event lists up to twelve of its fields, then how many more.
