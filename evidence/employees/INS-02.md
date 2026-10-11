# INS-02 — Medical insurance and driving licence: the screens — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for all 3"). No API change.

## What changed

| Screen | Change |
|---|---|
| Person record → Profile → Employment | Four fields: policy number, insurance expiry, licence number, licence expiry. Editable by the roles that edit other ID fields. Emptying one **clears** it |
| Person record → Documents | The two rows are real: date, days-left chip, Renew (within 90 days), file column. Add document offers the two new categories |
| People | The Document filter's two entries are no longer "soon"; chips and the soonest-first order count both documents |
| Overview, Client record, Reports | The runway's two rows carry counts; cells open the matching people. "Expiring in 30 days" figures count both |
| My file (employee) | Both documents in the list (only when a date or file exists); both numbers under My IDs |
| Client portal → Employees | Two date columns. No number anywhere on the page |
| Client portal → Documents | The two categories appear in the filter |

Most of this is one change: `apps/web/src/lib/employee-docs.ts` is the list every one of those screens reads.

Files: `lib/employee-docs.ts`; `employees/[id]/profile-tab.tsx`, `documents-tab.tsx`; `employees/page.tsx`; `me/page.tsx`; `portal/employees/page.tsx`, `portal/documents/page.tsx`; `messages/en.json`, `messages/ar.json`.

## Checked on screen (local)

**As HR officer, on Ahmed Hassan**

| Step | Result |
|---|---|
| Profile → Edit Employment → fill the four fields → Save | **One** request, carrying only the four fields. Read back from the API: all four stored |
| Documents tab | "Medical insurance · CCHI · 21 Oct 2026 · 10d left · Renew" and "Driving licence · Absher · Traffic · 1 May 2031 · 1663d left" (no Renew: more than 90 days away) |
| Renew on medical insurance | Dialog opens with one year from the current date prefilled (21 Oct 2027). Cancelled, nothing saved |
| People, Arabic, filter «التأمين الطبي» | 1 person, chip «باقٍ 10 أيام · التأمين الطبي». Page overflow 0 |
| Overview runway | "Medical insurance" 1 in the 8–14 day column, 1 tracked; "Driving licence" 1 tracked. Row links open People filtered by that document |
| Profile → empty both licence fields → Save | One request: `{"drivingLicenceNumber":null,"drivingLicenceExpiry":null}`. Both cleared; the insurance fields untouched |

**As the employee (Ahmed Hassan), Arabic, phone width (375)**

- My documents lists التأمين الطبي (10 days, amber chip) and رخصة القيادة with its date.
- My IDs shows both numbers.
- After the licence was cleared, its row left the list.
- Page overflow 0.

**As the client manager of the same company**

- The API response carries the two dates and `null` for both numbers. Neither number appears anywhere in the response text or on the page.
- The list shows the two new date columns. Page overflow 0 at 375.

Web typecheck, lint and production build clean.

## Found while checking

- **Fixed (one line):** on My file in Arabic, the sentence under "My documents" read out of order — it holds the Latin name PEOPLE&GRO, and under the left-to-right layout its two halves swapped sides. It is now one isolated run. This was there before this card.
- **Not fixed, filed as DEP-05:** the runway still says "Not stored yet — coming soon" for the three dependant rows. Dependants have been stored since DEP-01; what is missing is a way for the runway to read every employee's dependants in one request.

## Not checked

- Uploading a file under the two new categories through the browser (the upload itself is the same flow as every other category; the API side is tested in INS-01).
- The Reports and Client-record runways were not opened separately; they render the same table from the same list as the Overview.

## Local data

For the check, self-service and the client portal were switched on for the sample company by SQL. The portal switch was removed afterwards. Ahmed Hassan keeps a sample policy number and date until the next re-seed (INS-03).
