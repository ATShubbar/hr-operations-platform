# DEP-00 — Dependants into the architecture (ADR-017, architecture.md v1.11) — Evidence

- Date: 2026-10-05
- Status: **done**. Documentation only: no code, nothing deployed.

## Owner decisions (asked; answers recorded)

| Question | Answer |
|---|---|
| Who sees an employee's dependants? | **Staff + the employee** (recommended). Client managers see nothing. |
| Treat dependant expiries like the employee's own documents? | **Shown on the record only.** No alerts, runway or auto-procedures for now. |
| Include the SAR 4,800 dependant fee? | **No, leave it for Billing** (recommended). Shown "coming soon". |
| Who may add, edit and remove a dependant? *(asked after approval; see below)* | **`govdata.update` holders** (recommended): Administrator, HR officer, GRO officer |
| The DEP-00 card | **approved** |

## A correction made after approval, and surfaced rather than slipped in

The approved card said dependants are changed with `employee.update`, plus `govdata.update` for
the iqama number. Checking that against the matrix while writing the ADR showed two problems:
- **The GRO officer holds no `employee.update`** (core profile: R), yet holds CRUD on government data. Family iqama renewals are GRO work.
- **The prototype gates "Add a dependant" on edit rights to the ID fields** (`canEditField('ids')`), not the core profile.

I asked again before writing. The owner chose `govdata.update` holders. ADR-017 records the
correction ("corrected in the card's review").

## What the research found first

- **architecture.md** line 51 listed "dependants" under *Out of scope* (since v1.1).
- **Other references, checked for consistency:**
  - ADR-011 line 155 and ADR-014 line 11 quote the old exclusion as history. Left as written, because they record what was true then.
  - ADR-015 says dependants are not searchable. Still true: ADR-017 keeps search out of scope.
- **Prototype** (`design/…/People & Gro Console.dc.html`):
  - `SEED_DEPENDANTS` holds a relationship (Spouse/Son/Daughter), EN/AR names, birth date, an iqama number, and iqama/passport/insurance expiries.
  - The Family tab shows rows with documents, days-left chips and **Renew** (≤ 90 days).
  - The Add dialog asks for relationship, full name, Arabic name and iqama number ("Leave empty if not yet issued").
  - It shows "SAR 4,800 a year, payable on the sponsor's account" as a fee.
- **App:**
  - the Family tab is "coming soon" (DS-06);
  - `dependantDoc` labels exist in the messages;
  - nothing stores dependants.
- No test parses architecture.md (only comments mention it), so the new matrix row changes no test.

## What changed

| File | Change |
|---|---|
| `adr/ADR-017-dependants.md` | NEW. Context, options, ownership + shape, who sees, who changes, expiries, fees, out of scope, consequences, build. |
| `architecture.md` | **v1.11** + changelog. "dependants" removed from *Out of scope*, with a history line. A **Dependants** row in the matrix. Employees module note. |
| `adr/README.md` | ADR-017 indexed. |
| `BACKLOG.md` | DEP-00 (done), DEP-01..04 (planned). |
| `CLAUDE.md` | Map (v1.11, ADR-001..017) + state. |

## Choices of ours, stated in the ADR

- **No `client_id` on `emp_dependants`.** A copy would go stale when a sponsorship transfer moves
  the employee. No company-scoped role reads the table, so isolation doesn't need it.
- **Audit `resource_id` = the sponsoring employee**, as employee-account writes do, so changes
  appear on the Person record's History. Severity **notable**, like `govdata.update`.
- **Soft removal**, because history refers to the dependant.
- **No new permission**: `employee.read`, `govdata.read` and `govdata.update` express every rule.
