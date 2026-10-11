# SOON-01 — Export register — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("let's work on the rest 3 points now"). Owner decisions: who may export =
  "Everyone who sees the button in the prototype"; which rows = "What is on screen".
- ADR-013 **rev. 3** (one permission added to the catalog).

## What it does

The "Export register" button on People and on both Overviews downloads the list as a CSV file.
It had been shown disabled, marked "Soon", since DS-05.

| | |
|---|---|
| Who | Administrator, HR officer, GRO officer; a client manager for their own company. Not the Auditor (no button, and the route refuses them). New permission `employee.export` |
| Rows | What is on screen. From People with a filter or a search: exactly those people, in that order. With neither, and from an Overview: everyone the person may see |
| Columns | Names, company, position, department, nationality, status, hire date, contract end — and then only what the reader already sees: the five expiry dates, six identifier numbers, five pay columns |
| Never | A bank account number is in no export, whoever asks |
| Recorded | Every export is an audit entry — who, how many rows, which columns, all or a selection, and a fingerprint (SHA-256) of the file — written BEFORE the file is returned |

## How

- `POST /employees/export` (staff) and `POST /portal/employees/export` (client manager). The body
  may carry `ids`: what the screen is showing. It is a FILTER over what the caller may read — an
  id they cannot read matches nothing. No `ids` = everyone; an empty list = nobody. At most 2,000.
- The rows are redacted by the same function the screens use (`toEmployeeResponse`) before the
  file is built, and the columns are chosen from the same visibility
  (`employees/domain/register-export.ts`). So the file cannot hold more than the screen.
- The client route takes the company from the session and needs the portal switched on for that
  company, as the portal's list does.
- **A cell that a spreadsheet would run as a formula is written as text.** A name such as
  `=HYPERLINK(...)` would otherwise execute for whoever opens the file; `csvText()` puts an
  apostrophe in front. The older report and audit exports do not do this — follow-up CSV-01.
- Web: one shared `components/export-register-button.tsx` replaces the three disabled buttons.

## Tests — `apps/api/test/employee-export.e2e-spec.ts`

10 tests, written first: all 10 failed (the routes did not exist).

| Red proof | Tests that fail |
|---|---|
| 1 The staff route does not check for staff — a client manager HOLDS the permission, so this is a real proof | 1 |
| 2 The client route reads every company | 1 |
| 3 The client route uses staff visibility | 1 |
| 4 The client route ignores the portal switch | 1 |
| 5 No formula guard | 1 |
| 6 The export is not audited | 2 |
| 7 Pay columns in every file | 2 |
| 8 Identifier columns for a reader who only sees dates | 1 |
| 9 The ids are ignored | 4 |
| 10 Unknown keys in the body are accepted | 1 |
| 11 The Auditor is given the permission | 1, and 2 in the pinned role table |
| Restored (six files byte-identical) | 10 / 10 |

API suite **931 / 931** (921 + 10). Contracts 34 / 34. Lint, typecheck and build clean for every
package. Registered in the isolation list, the audited-writes list and the pinned role table.

## Checked on screen (local)

**The file equals the list** (HR officer, People):

| On screen | Sent | In the file |
|---|---|---|
| Company filter: Alpha Trading Co. — 12 people | 12 ids | 12 rows, same people in the same order, one company |
| Document filter: medical insurance, 15–30 days — 1 person | 1 id | 1 row, the same person |
| Search «محاسب» — 3 people | 3 ids | 3 rows, the same people; positions محاسب, محاسبة, محاسبة تكاليف |
| No filter — 41 people | none | 41 rows |

**Each role gets its own columns:**

| Who | Where | Result |
|---|---|---|
| HR officer | People | 27 columns, with identifier numbers and pay |
| GRO officer | Overview (Arabic) | 41 rows, 22 columns: numbers, **no pay** |
| Client manager, portal on | Overview (Arabic, 375px) | 12 rows, their company only, 16 columns: dates, **no numbers, no pay**; message «تم تصدير 12 موظفًا.»; no sideways overflow |
| Client manager, portal off | Overview | button disabled; a direct call is refused (403) |
| Auditor | People | no button; a direct call is refused (403) |

**The audit trail** shows "Exported the employee register", graded Notable, for each of the
above, with the rows, the column list, "all" or the company, and the file's fingerprint.

The sample company's portal was switched on by SQL for the check and off again; the temporary
authenticator was cleared; the database re-seeded.

## UAT smoke check

Two checks added to `apps/api/scripts/uat-smoke.mjs`: the HR officer downloads the register (a
CSV with rows), and the staff route is refused to a client manager. They run with "Seed UAT";
not run locally in this card.

## Not done, and found

- **Column headings are in English** in both languages, and nationality is the two-letter code
  the record stores, not a country name.
- **More than 2,000 people on screen with a filter set** cannot be exported as shown; the button
  says so and asks to narrow the list or clear the filters. (The whole register has no limit.)
- **CSV-01 (new):** the report export and the audit-trail export do not guard against formula
  cells.
- **AUDIT-09 (new):** on the Audit trail, something done by a client manager shows an id fragment
  (`#4a810157`) instead of a name — the page names staff only. Not new with this card; seen now
  because a client manager's export is the first of their actions I looked for there.
- The audit entry's "record" column reads "an employee record" for an export; the sentence
  beside it is right ("Exported the employee register").

## Files

`packages/contracts/src/employee.ts`, `index.ts`; `apps/api/src/csv/csv.ts`;
`apps/api/src/modules/employees/` (`domain/register-export.ts` new, controller, service,
public-api); `apps/api/src/modules/portal/api/portal.controller.ts`;
`apps/api/src/modules/auth/domain/permissions.ts`; `apps/api/src/modules/audit/domain/severity.ts`;
three test registries and `test/employee-export.e2e-spec.ts` (new);
`apps/web/src/components/export-register-button.tsx` (new) and the three screens;
`apps/web/messages/*.json`; `adr/ADR-013-six-role-model.md`.
