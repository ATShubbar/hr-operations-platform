# ADR-017 — Dependants: the family on an employee's sponsorship

- Status: Accepted (rev. 1, 2026-10-11: dependants join the runway and the expiring figures — DEP-05; rev. 2, 2026-10-11: a dependant's iqama renewal as a procedure — DEP-06)
- Date: 2026-10-05
- Owner: Ahmed Alshubbar (product decision; DEP-00)
- Amends: **architecture.md** — scope (dependants were out of scope in v1.1–v1.10), the
  permission matrix (a Dependants row) and the Employees module's description. Now **v1.11**.

## Context
An expatriate employee in the Kingdom sponsors their family: each spouse and child holds their
**own iqama**, passport and medical insurance, each expiring on its own clock and renewed
separately. The prototype says family iqamas are "a large share of real GRO work". It gives the
Person record a **Family** tab with these elements:
- the dependants, with name in both languages, relationship, age and iqama number;
- each dependant's iqama, passport and insurance expiry, with a days-left chip and Renew inside 90 days;
- an **Add a dependant** dialog;
- a "N dependants sponsored · SAR … in annual dependant fees" line.

architecture.md has listed dependants as **out of scope** since v1.1. The web app shows the
Family tab "coming soon" (DS-06), and global search says dependants aren't searchable (ADR-015).
Nothing stores them.

## Options considered
1. **Keep them out of scope.** GRO work on family iqamas stays outside the system: in
   spreadsheets, with no record of it.
2. **Model dependants as employees.** They are not employees: no contract, salary, employer, or
   self-service account. They would pollute every headcount, report and list.
3. **A dependant record that belongs to the employee** (chosen).

## Decision (owner decisions marked ★)

### Ownership and shape
- Dependants belong to the **Employees** module: table `emp_dependants`, one row per family
  member, keyed to the sponsoring `employee_id` (a bare reference, like the rest of the system).
- **Fields:**
  - relationship (**spouse · son · daughter**, as the prototype);
  - name in English (required) and Arabic (optional, as the prototype's dialog);
  - date of birth;
  - iqama number (optional; "not yet issued" is normal);
  - iqama expiry, passport expiry and insurance expiry (each optional).
  - Dates are stored Gregorian; Hijri is rendered.
- **No `client_id` copy.** The company is the employee's. A copied column would go stale when a
  sponsorship transfer moves the employee to another company, and no company-scoped role reads
  this table (below).
- **Removal is soft:** a removed dependant leaves the list but stays in the database, because the
  audit trail and the Person record's History refer to it.

### Who sees ★
- **Staff:**
  - Administrator, HR officer, GRO officer and Auditor read dependants with `employee.read`.
  - The **iqama number needs `govdata.read`**, the same rule as the employee's own identifiers; without it the number is masked.
  - Today every staff role holds both permissions, so the rule matters for future roles and field-access editing.
- **The employee** sees **their own** dependants in My file, read-only, **numbers included**. This
  matches ADR-011's "government identifiers with numbers". It is under `self-service.read`, behind
  the per-client self-service flag, and fenced at the database to their own `employee_id`
  (`app_employee` SELECT, an `employee_self`-form policy).
- ★ **Client managers see nothing.** Family details are not the employer's business; `app_client`
  gets no grant on the table.

### Who changes them ★
- ★ **Holders of `govdata.update`** add, edit and remove dependants: Administrator, HR officer
  and GRO officer. This follows the prototype, which gates Add on edit rights to the ID fields.
  A dependant is a sponsorship record, and family iqama renewals are GRO work.
  - *Corrected in the card's review:* the first draft said `employee.update`, which would have shut out the GRO officer.
- The Auditor reads only. Employees change nothing; corrections go through a request, as for their own record.
- Every change is audited as resource `dependant`, with **`resource_id` set to the sponsoring
  employee** (as employee-account writes do). It therefore appears on the Person record's History
  (AUDIT-06); the dependant's own id travels in the entry.
- Severity: **notable**, like `govdata.update`, because it carries identifier numbers. This is
  added to the AUDIT-07 table in DEP-02.
- **No new permission.** The existing `employee.read`, `govdata.read` and `govdata.update` cover it.

### Expiries ★
- ★ **Shown on the record only.** A dependant's iqama, passport and insurance dates appear on
  the Family tab (Gregorian + Hijri, days-left chip) and in My file.
- They do **not** yet feed any of these:
  - the expiry alerts;
  - the runway;
  - the People filters;
  - the Overview;
  - GRO's automatic renewal procedures.
  
  Adding them to the expiry engine is a deliberate later step that needs its own card.
- **Renew** on the Family tab writes the new expiry date where it lives, on the dependant, as DS-07 does for the employee's own dates.

### Fees ★
- ★ **Left for the Billing epic.** The prototype's "SAR 4,800 a year" dependant fee is a government
  fee, not a property of the dependant. The Family tab shows the fee line **"coming soon"**
  (owner rule: unbuilt parts are shown, marked, never faked).

### Out of scope
- Dependants in expiry alerts, the runway, the Overview and reports.
- Dependant documents (files) in the documents registry.
- Searching dependants (ADR-015 already says so).
- Family visit visas as a modelled process.
- Relationships beyond spouse/son/daughter; parents are sponsored differently.
- Fees.

## Consequences
- **A table holding personal data about people who are not users of the system:** names, dates of
  birth and iqama numbers of spouses and children.
  - It gets the same protection as the employee's own government data: identifier numbers only with `govdata.read`.
  - Every write is audited and nothing is hard-deleted.
  - Client managers have no access at all.
- One more employee-readable table: the `employee_self` checklist (apps/api/src/modules/README.md),
  and the isolation harness's same-company colleague probe on the employee route.
- The global-search "dependants aren't searchable yet" note stays true.
- When dependants join the expiry engine, the engine's categories gain dependants. That is a
  later card, deliberately not designed here.

## Revision 1 — 2026-10-11 (DEP-05)
The decision kept dependants' expiries on the record only, and listed "the runway, the Overview and
reports" as a later step. Alerts came first, with the notification ladder (ADR-021). This revision
adds the rest (owner decisions):

- **One read for counting:** `GET /dependants/expiries` returns every current dependant's three
  expiry dates and the sponsor's id — nothing that identifies a dependant (no name, no birth date,
  no iqama number, not even their id). Read with `employee.read`; staff only, by the same second
  lock as the other dependant routes. Optional `clientId`. No new permission.
- **The runway** shows the three dependant rows with real counts, for the dependants of the people
  it is given.
- **"Documents expiring in 30 days"** counts dependants' documents too, everywhere staff see it:
  the Overview tile, client cards, the client record and Reports (tile and forecast). The
  prototype counts them only on the Overview tile; one label meaning two things was judged worse
  than departing from it.
- **Client managers still see nothing of a family.** Their Overview's runway has no dependant rows
  and their figures are unchanged.
- People's document filter gains the three dependant documents so a runway cell can open the
  sponsors concerned (DEP-05b).

## Revision 2 — 2026-10-11 (DEP-06)
The last part of "dependants join the expiry engine": renewing a dependant's document as tracked
work. The prototype has no such procedure (only Renew on the Family tab); this follows the pattern
already used for the employee's own documents (owner decisions):

- **One procedure type, `dependant_iqama_renewal`** — the iqama only. Insurance and passport keep
  the Renew button. **One procedure per dependant**: each has their own date and fee.
- **It lives on the sponsoring employee** and names the dependant (`gro_processes.dependant_id`).
  The dependant must be a current dependant of that employee. One renewal in flight per dependant.
- **Completing it writes the new date to the dependant**, through Employees, audited against the
  sponsor like any other change to a dependant.
- **Removing a dependant cancels their open renewal** (Employees publishes `DependantRemoved`; GRO
  subscribes — the direction GRO already depends in).
- **The fee prefilled on completion is the annual dependant fee** — the one figure in the
  standard-fees setting. There is no second figure to keep in step.
- **A client never sees one.** Client managers read their company's procedures (status only); a
  dependant procedure would tell them a family exists, and this decision gives clients nothing of
  a family. A RESTRICTIVE database policy hides these rows from the client connection, so no
  query can forget to.
- No new permission: `gro.process` starts and completes it, as for any procedure.

## Build
- **DEP-01:** the table, its database fences and an audited service.
- **DEP-02:** the API (staff CRUD on `/employees/:id/dependants`; the employee's own read), with redaction.
- **DEP-03:** the Person record's Family tab.
- **DEP-04:** the family section in My file.

## Links
ADR-011 (self-service: an employee sees their own government data with numbers), ADR-013 (the
matrix), ADR-015 (search excludes dependants), AUDIT-06 (History by `resource_id`), AUDIT-07
(severity), DS-06/DS-07 (the Person record).
