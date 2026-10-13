# PEOPLE-01 — The People page as "one sheet" — Evidence

- Date: 2026-10-13
- Status: **done**
- Card approved ("approved"). ADR-012 rev. 1.

## How it was chosen

The owner shared a reference list they liked. Three previews were built on the real data
(floating rows, one sheet, cards). The owner chose the sheet, with one condition — "it should
stay with our current theme" — and two decisions: "a switch between grouped and flat, and I
like the soft colours for departments".

## What changed on the page

- **One sheet** in the app's theme: white page, ringed card, grey header band, the existing
  controls, day chip and status pill.
- Each row: avatar and both names · department · position (two-tone: "Senior" in grey,
  "Accountant" in black) with nationality · iqama expiry in both calendars · first document due
  · employment status.
- **Arrange**: "By company" (a heading per company with its count) or "One list" (the company
  becomes a column). Opens by company; the last choice is remembered on that device.
- **Sort by**: first document due · name · newest employees.
- **Department in a soft colour** — the one coloured thing in the theme. The same department
  always gets the same colour; the pill always carries the name.
- On a phone a person is a stacked block; the list no longer scrolls sideways.
- A row is one link (one focus stop per person) rather than a clickable table row with a link
  inside it.

Kept exactly as before: search, the Client / Document / Time-left filters (dependants'
documents included), Clear filters, Export register, Add person, 50 per page, the links from
the Overview and client pages (`?client=`, `?doc=`, `?band=`), and opening the Family tab under
a dependant filter.

New files: `lib/department-tint.ts`, `components/department-pill.tsx`,
`components/job-title.tsx`, `scripts/verify-department-tints.mjs`. No server change.

## The colours are checked

`apps/web/scripts/verify-department-tints.mjs` runs in the web lint. Written first; it failed
(no colour table), then passed.

- every colour pair is at least 4.5:1 — the least readable is **5.10:1**. As first drawn in the
  preview they measured 2.94–4.23; the text of each was darkened, the pale grounds kept;
- each ground stays a pale tint;
- the same department gets the same colour however it is typed (capitals, spaces, Arabic);
- ten sample departments spread over at least four colours.

## Checked on screen (local, sample data, HR officer)

**The same people as the data says.** For four filtered addresses the rows shown were compared
with a list worked out separately from `/employees`:

| Address | Expected | Shown | Same people |
|---|---|---|---|
| `?doc=iqama&band=overdue` | 2 | 2 | yes |
| `?doc=insurance&band=31-60` | 2 | 2 | yes |
| `?client=<Alpha>` | 12 | 12 | yes |
| `?doc=passport` | 0 | 0 | yes |

The summary line and the column heading followed each filter ("2 employees · Iqama already
expired", "Iqama expiry").

- **Unfiltered:** 41 people under 5 company headings (3 · 12 · 9 · 8 · 9), "41 employees ·
  sorted by the document that expires first".
- **Dependant filter** (`?doc=dep-iqama`): the three sponsors, each row opening `?tab=family`.
- **One list:** no headings, a Client column, the most urgent first across all companies (Syed
  Ali 9d over, Shah Mohammed 7d over, Mohammed Rahman 4d over). The choice was stored and the
  page reopened in it; then set back to "By company".
- **Export register** with the Alpha filter: the request carried 12 ids, the same people in the
  same order as the 12 rows.
- **Paging**, with the page size lowered to 10 for the check and restored to 50 afterwards:
  5 pages of 10, 10, 10, 10 and 1; 41 different people across them; a company continued onto
  the next page under its heading, and the heading showed the whole company's count.
- **Arabic, 375px:** 41 people, 5 headings, 0px overflow, no row wider than its box; the
  summary reads «41 موظفًا · مرتّبون حسب المستند الذي ينتهي أولًا».
- English at 1280px: 0px overflow, no row clipped, in both arrangements.

## Checks

- Web lint (with the Arabic-messages, audit-changes and department-colour checks), typecheck.
- The preview pages for People are removed.

## Stated

- The two-tone job title works on English titles only; an Arabic title is shown whole.
- Two different departments can share a colour (six colours); the name is always on the pill.
- A changed order or arrangement alone does not change what Export sends: with no filter and no
  search it still exports everyone.
