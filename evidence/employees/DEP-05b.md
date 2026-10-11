# DEP-05b — People lists the sponsors of expiring dependant documents — Evidence

- Date: 2026-10-11
- Status: **done** — closes DEP-05
- Card approved ("approved for both"). No API change (it uses DEP-05a's read).

## What changed

**People → Document filter** gains three entries: Dependant iqama, Dependant insurance, Dependant passport.

- Choosing one lists the **sponsors**: the employees whose dependants hold that document. The list is of employees, and a dependant is reached through their sponsor's record.
- A sponsor with several matching dependants is one row. It is judged on the soonest date the time-left filter keeps, and the chip says how many: "6d over · Dependant iqama · 2 dependants".
- Under a dependant filter, a row opens the person's **Family** tab.
- If the dependants' dates could not be read, the three entries are disabled.

**Runway (Overview).** Each dependant cell, and each dependant row's label, is now a link to that list.

With no document filter, a row is still judged on the person's own documents, as before.

Files: `apps/web/src/app/[locale]/(app)/employees/page.tsx`, `clients/runway-table.tsx`, `overview/page.tsx`; `messages/en.json`, `messages/ar.json`.

## Checked on screen (local, as HR officer)

| Address | Result |
|---|---|
| Overview runway, dependant rows | Every cell and label is a link: `…/employees?doc=dep-iqama&band=overdue`, and so on |
| `?doc=dep-iqama&band=overdue` | "1 employee · Dependant iqama already expired" — Rajesh Kumar, "6d over · Dependant iqama · 2 dependants" |
| `?doc=dep-iqama` | Rajesh Kumar (6d over, 2 dependants) · Ahmed Hassan (12d left, 2 dependants) · Syed Ali (210d left) — soonest first |
| `?doc=dep-insurance&band=61-90` (Arabic) | «موظف واحد · تأمين المُعال ينتهي خلال 61–90 يومًا» — Syed Ali, «باقٍ 75 يومًا» |
| `?doc=dep-iqama` (Arabic, 375 wide) | The three rows, «… · 2 مُعالين»; page overflow 0 |
| Click Rajesh Kumar in the filtered list | Opens `…?tab=family` on the Family tab ("3 dependants sponsored") |

The names and days agree with the database rows listed in DEP-05a's evidence.

Web typecheck, lint and production build clean. API unchanged: 889/889.

## Two things to know

- **A cell counts documents; the list shows people.** The runway's "2" under Dependant iqama · Overdue opens one row, because both lapsed iqamas belong to one sponsor's family. The row says "2 dependants" so the numbers can be reconciled.
- **The list is everyone, the runway is people under management.** People shows every employee, including leavers and people at an archived company; the runway counts only people under management. A dependant of a leaver would appear on the list and not in the runway. This is already true of the employees' own documents, and the sample data has no such case.

## Not done

- The Client record's runway stays plain numbers (as it is for the employees' own documents there).
- No automated test: the web app has no test harness for pages, and the API is unchanged.
