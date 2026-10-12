# AUDIT-11 — An edit records what changed — Evidence

- Date: 2026-10-12
- Status: **done**
- ADR-022. Card approved in advance ("approved for all 5").

## The rule

For an edit, the audit entry's `before` and `after` hold what names the record plus **every
field the edit changed** — the old value in `before`, the new in `after`. Unchanged fields are
not repeated. Pay and ID values are recorded (owner decision).

One helper does it for every module: `apps/api/src/modules/audit/domain/change-set.ts`.

- `auditEdit(before, after, identify)` compares the stored row before and after, column by
  column. Because it walks the row itself, a column added later is recorded with no list to
  keep up to date.
- `auditCreated(row, identify)` records what a new record was created with (fields holding a
  value).
- A day is recorded as `YYYY-MM-DD`, an instant as ISO, an amount as a number. The row's own
  bookkeeping (`id`, `createdAt`, `updatedAt`) is never a change.

## What the inventory found

`apps/api/test/audit-records-change.e2e-spec.ts` takes **every audited edit route** (22) and
every field each lets a person change. Each field is set twice through the API — to A, then to
B — and the second entry must hold a field that was A before and is B after.

First run against the old code — 7 of 10 groups failed. More than the three records the ADR
named were recording too little:

| Record | What was invisible before |
|---|---|
| Employee | 9 of 12 profile fields, all 9 pay fields, all 17 ID fields |
| Dependant | 6 of 8 fields (names only were recorded) |
| Candidate | 6 of 7 fields |
| Request | the description |
| Task | the description |
| Vacancy | the description, the Arabic title |
| Procedure | the reference number, the notes |
| Calendar event | description, location, end time, all-day |
| Google Calendar invitation | everything in the payload |

Already complete, unchanged: client, staff account, client account, employee account, fee,
invoice record, commercial terms, settings (three levels), notification preference.

All ten groups pass now: **104 fields across 22 routes**.

## Changed

- New: `audit/domain/change-set.ts`, exported from the audit module.
- Employees, dependants, candidates: edits use `auditEdit`, creations `auditCreated`. The
  employee entry no longer repeats status and contract type on every entry — they appear when
  they change.
- Requests (both paths), tasks, vacancies, procedures, calendar events, invitations: the edit
  keeps its existing snapshot and adds every other changed field.
- Status moves, stage moves, filings and the like were already showing their change and are
  untouched.

## Tests rewritten on purpose

Four tests pinned the old rule ("no values"). They now pin the new one:

- `dependants.e2e-spec.ts` — a new dependant's entry holds its iqama number; an edit holds
  the old and new number and date, and only the changed fields beside the name.
- `employees-api.e2e-spec.ts` — an ID edit's entry holds the old (empty) and new numbers; the
  employee entries contain pay and ID fields.

## Red proofs

| Break | Tests that fail |
|---|---|
| 1 An employee edit records only its name | 4 |
| 2 A dependant edit records only who it is | 2 |
| 3 A candidate edit records only its fixed three | 1 |
| 4 A request edit records only its fixed snapshot | 1 |
| 5 A procedure edit records only its fixed snapshot | 1 |
| 6 A calendar edit records only its fixed snapshot | 1 |
| 7 Unchanged fields are repeated | 3 |
| 8 The record's bookkeeping counts as a change | 4 |
| 9 An amount is recorded as text | 4 |
| 10 A day is recorded as an instant | 5 |
| 11 A new record lists its empty fields | 1 |
| 12 A new dependant is recorded without its values | 1 |
| Restored — tree identical to the staged copy after each | 45 / 45 |

**A mistake in the first attempt, stated:** the first run of these proofs did not restore
between them. The backup loop used `for f in $FILES`, which zsh does not split into words, so
no backup was made and "restore" did nothing; twelve breaks piled up in the working files while
the script printed RESTORED. Its own `cmp` check reported the failure. The files were put back
by hand, checked line by line against the intended change, and the proofs were re-run restoring
from the staged copy (`git checkout -- src`) with a "tree is clean" check after each. The table
above is the second run.

## Checks

- API suite **978 / 978** (962 + 16). API lint and typecheck clean.
- Database re-seeded after the suite.

## Stated

- Entries written before this stay as they were; nothing is filled in.
- The audit export now carries these values (ADR-022).
- The screens still show field names and values raw — that is AUDIT-12 (Audit trail) and
  HIST-01 (History).
