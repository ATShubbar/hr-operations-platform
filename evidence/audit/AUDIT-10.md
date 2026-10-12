# AUDIT-10 — Decision: the audit trail records what changed — Evidence

- Date: 2026-10-12
- Status: **done** (decision record; no code)
- Owner asked: "in the audit trail we show the details of what was changed, from what to what"
  and "in people history the information and details should be there". Cards AUDIT-10..13 and
  HIST-01 approved in advance ("approved for all 5").

## What was found before deciding

Measured on the local trail (sample data plus test runs):

| Kind of edit | What the entry stores | Result |
|---|---|---|
| Employee (profile, pay, IDs, termination, dates written back) | name, employment status, contract type — the same three before and after | most edits show **no difference** |
| Candidate | stage, name, vacancy | any other change is invisible |
| Dependant | the names of the changed fields | no values |
| Request, task, procedure, client, leave, vacancy, invoice, accounts | a snapshot of the record | a change shows |

The Audit trail shows changes only inside the entry window, as raw field names
(`employmentStatus`) and raw values (`in_progress`, ids). A person's History shows one line
per event and no values.

## Owner decisions

1. **Pay and ID values are recorded** — "Record the values". Options not taken: pay in full with
   ID numbers masked to four digits; recording only that a field changed.
2. **History shows details by the same rule as the record** — pay details with `salary.read`,
   ID numbers with `govdata.read`. Option not taken: details for Administrator and Auditor only.

## Recorded in

- `adr/ADR-022-audit-detail.md` (Accepted) and its row in `adr/README.md`.
- `architecture.md` **v1.16** — the version line, a v1.16 summary, and the Audit Logs line.
- `adr/ADR-017-dependants.md` — status line notes the revision (a dependant edit records values).

## Stated in the record, so nobody is surprised later

- The audit table becomes a second copy of pay and ID values — the bank account number
  included — kept as long as the trail and carried by every audit export. Only Administrator and
  Auditor read it; the export is itself audited as Critical.
- Entries written before the change cannot be filled in.
- Client managers and employees read neither surface; nothing changes for them.

## Next

AUDIT-11 (record what changed) → AUDIT-12 (readable Audit trail) → HIST-01 (History details) →
AUDIT-13 (Actor filter).
