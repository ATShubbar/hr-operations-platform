# ADR-022 — The audit trail records what changed, and History shows it

- Status: Accepted
- Date: 2026-10-12
- Owner: Ahmed Alshubbar (product decision; AUDIT-10)
- Amends: **architecture.md** (Audit Logs, the History surface). Revises **ADR-017** (what a dependant edit records). Reverses two earlier build rules: EMP-01 ("salary and government-data values never enter the audit trail") and AUDIT-06 ("a person's History never carries before/after"). Now **v1.16**.

## Context

The architecture has always said every change is logged "with actor, client scope, before/after". In practice three kinds of edit record too little to answer *what changed, from what to what*:

- **An employee edit** stores the same three facts before and after — name, employment status, contract type. Change a job title, a salary or an iqama date and the entry shows no difference at all. This was deliberate (EMP-01): pay and government-data values were kept out of the trail.
- **A candidate edit** stores stage, name and vacancy; any other change is invisible.
- **A dependant edit** stores the *names* of the changed fields, never the values (ADR-017).

Everything else — requests, tasks, procedures, clients, leave, vacancies, invoices, accounts — already stores a snapshot in which a change shows.

Two screens read the trail:

- The **Audit trail** (`audit.read`: Administrator, Auditor) shows changes only inside an entry's window, as raw field names and raw values.
- A person's **History** tab (`employee.history`: every staff role) shows one line per event and, by AUDIT-06, never a value.

The owner asked for both to show what was changed, from what to what.

## Options considered

1. **Record that a sensitive field changed, without its value.** Rejected by the owner: the trail still could not say what a salary or an ID number was changed from or to — which is the question an audit of pay or identity is asked.
2. **Pay in full, ID numbers masked to the last four digits.** Rejected by the owner in favour of full values.
3. **Record the values** (chosen ★).

For History: show details only to the two roles that read the whole trail, or **by the same rule as the record itself** (chosen ★).

## Decision (owner decisions marked ★)

### What an edit records

- For an edit, `before` and `after` hold **every field the edit changed**, each with its old and its new value, plus the record's name so the entry can be read on its own. Unchanged fields are not repeated.
- ★ **Pay and ID values are recorded** — amounts, allowances, the bank account number, iqama / national ID / border / passport / work-permit / GOSI / insurance / licence numbers and every date — old and new. This applies to employees and to dependants.
- This is built for the three thin cases (employee, candidate, dependant). The other records keep their snapshots. A test holds the rule for all of them: **no audited edit may record "nothing changed"**.
- Entries written before this decision stay as they are. They cannot be filled in afterwards: the old values were never recorded.

### Who reads it

- **Audit trail** — unchanged readers (Administrator, Auditor), who already read every salary and every ID. They now see the values there too, and **the audit export carries them** (it already carries full before/after, AUDIT-07).
- ★ **History** — every reader of History sees the details of ordinary changes (job, department, dates, status, documents, procedures, sequences). **Pay details only with `salary.read`; ID numbers only with `govdata.read`** — the rule the record itself follows. A reader without the permission still sees that the event happened, without its values. Today that means the GRO officer sees everything except pay.
- Client managers and employees read neither surface. Nothing changes for them.

### Presentation

- The API stores and returns field **keys** and raw values. The screens turn them into words in both languages: field names, status labels, dates in both calendars, money as SAR, people and companies by name.
- The Audit trail shows the first changes on the row itself, and all of them in the entry's window. History shows them under each event.

## Consequences

- The audit table now holds a **second copy of pay and ID values**, append-only, kept as long as the trail is kept, and included in every audit export. It is readable only by Administrator and Auditor, whose export is itself audited as Critical with a fingerprint. This is the cost of an audit trail that can answer the question; it is accepted knowingly.
- A leaked audit export is now as sensitive as a leaked payroll file. The export stays behind `audit.export`.
- ADR-017's line "a dependant edit records field names, never the iqama number or the dates" is replaced by the rule above.
- The History contract changes on purpose: its test pinned "never before/after" and is rewritten to pin the new rule (details by permission).
- Severity grading (AUDIT-07) is unchanged.

## Build

AUDIT-11 (record what changed) · AUDIT-12 (the Audit trail reads in plain words, changes on the row) · HIST-01 (details in a person's History) · AUDIT-13 (the Actor filter lists client managers and employees who acted). Approved in advance by the owner.

## Links

architecture.md v1.16 · ADR-017 (dependants) · AUDIT-06 / AUDIT-07 evidence · DS-15 (the Audit trail screen).
