# INS-01 — Medical insurance and driving licence: data and API — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for all 3"). Owner decisions: a number and a date for each · client managers see the dates of their own people, never the numbers · renewal as a procedure is a later card (INS-04).

## What was built

**Employee record** (`emp_employees`, migration `20261016130000_employee_insurance_licence`): four optional columns.

| Column | Meaning |
|---|---|
| `medical_insurance_number` | Policy number, as printed (up to 60 characters) |
| `medical_insurance_expiry` | Date |
| `driving_licence_number` | Licence number (up to 60 characters) |
| `driving_licence_expiry` | Date |

The database refuses a blank or over-long number, for any writer. No grant changed: the table is granted per table, so the new columns follow the row rules already in place.

**Document categories** (migration `20261016120000_document_categories_insurance_licence`): `medical_insurance` and `driving_licence`, so an uploaded file can be matched to its row. Administrator, HR officer and GRO officer may upload either — the same three roles that may change the dates.

**API.** No new route and no new permission. The four fields ride in the existing government-data group:

| Who | Sees |
|---|---|
| Administrator, HR officer, GRO officer | Numbers and dates; may change them (`PATCH /employees/:id/govdata`, or at creation) |
| Auditor | Numbers and dates; changes nothing |
| Client manager (own people, portal on) | The two dates. The numbers are always empty |
| Employee (own file) | Numbers and dates |

Dates arrive as plain dates (`2027-03-31`). `null` clears a field. A bad date, a blank number or a number over 60 characters is refused with 400.

Files: `packages/contracts/src/employee.ts`, `self-service.ts`, `document.ts`; `apps/api/src/modules/employees/domain/employee-view.ts` (the three response mappers); `documents/domain/document-policy.ts`; `document-expiry/domain/recipients.ts`; `notifications/domain/expiry-content.ts` (labels); `docs/FIELD-MAPPING.md`.

## Tests

Written first, in four existing specs (7 new tests, 4 existing ones extended).

| Run | Result |
|---|---|
| Before any code | 5 failed; two specs could not set up (their fixtures name the new columns) |
| After | 42 passed in the four specs |

One new test passed before the code existed ("refuses a bad date, a blank number…" — any unknown field was already a 400). So each rule was broken in turn to see a test fail, then restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | The client portal is given the numbers | yes (2 tests) |
| 2 | The employee's own file leaves the numbers out | yes |
| 3 | The GRO officer may not upload the two categories | yes |
| 4 | The two dates are not converted on the way in | yes (4 tests) |
| 5 | The numbers are not validated | yes |
| 6 | The database rule is dropped | yes |

One test is a guard, not a proof: "the audit entry carries no number and no date". The audit snapshot has never carried government-data values; there was nothing to break without writing new code.

Full API suite: **868/868** (861 + 7). API typecheck and lint clean; web typecheck clean.

## Side effect to know about

The old daily expiry scan alerts by document category. A file uploaded under one of the two new categories, with an expiry date, will now alert Administrators, HR officers and GRO officers like any other. The scan is still switched off by default.

## Not done in this card

- No screen shows or edits the fields yet (INS-02).
- The notification ladder, the compliance report and the sample data do not know them yet (INS-03).
- Global search does not find a person by policy or licence number.
- The reference systems written in the field mapping (CCHI; Absher · Traffic) are the prototype's names, not checked.
