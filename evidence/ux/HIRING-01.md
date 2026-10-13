# HIRING-01 — The Hiring page as one sheet of candidates — Evidence

- Date: 2026-10-13
- Status: **done**
- Card approved ("approved"). ADR-012 rev. 2.

## How it was chosen

After the People page, the owner asked to see three versions of the other lists. Twelve
previews were built (Clients, Requests, Hiring, Work queue — three each). The owner's choice:
"I only want to do version A for Hiring, forget about the rest." Asked whether the board should
stay as a second view: "The sheet replaces the board."

The other eleven previews were deleted; nothing of them was committed.

## What changed on the page

- **One sheet** in the app's theme replaces the six-column board. A candidate is a row: avatar
  and both names · nationality · stage (a soft-coloured pill) · health and target date · how
  long since added (and the note, if any) · the move buttons.
- **Arrange**: "By role" (a heading per role) or "One list" (role and company become a
  column). Opens by role; the last choice is remembered on that device.
- **Filters**: search (name, role, company, nationality; Arabic folded), client, stage — with
  "Not progressing" for the candidates who left the pipeline, who are otherwise off the page as
  they were off the board. **Sort by**: target date · stage · newest.
- **A role's heading** carries what the roles strip carried: company and department, status,
  how many are in the pipeline and onboarded, positions filled, days open, and Add candidate /
  Open role / Close role / Withdraw. A role with nobody in it still shows, so a candidate can be
  added. A role that has closed is named above any candidate still shown under it, with no
  actions.
- **In One list** there are no headings, so "Add candidate" at the top asks which role.
- On a phone a candidate is a stacked block; nothing scrolls sideways.

## Every move is still there

| The board | The sheet |
|---|---|
| "Move forward" on the card | "Move forward" on the row |
| "To visa & mobilisation" / "Onboard directly" at Offer | the same two buttons on the row |
| drag to the next or previous column | gone — the buttons, and the candidate's window |
| one step back, not selected, withdrew, target date | the candidate's window, unchanged |
| the two moves that create an employee ask first, with the Nitaqat warning | unchanged |
| a mobilising card: "N of 11 filed", Open onboarding | the same on the row |

No server change: the same endpoints, and the server refuses what it refused.

## Checked on screen (local, sample data)

As the HR officer, at 1280px unless said:

- **The same candidates as the data.** 12 rows = the 12 candidates still in the pipeline
  from `/candidates`; seven role headings, two of them empty and still shown.
- **Move forward** on Rajesh Kumar's row: Applied → Screened (toast "Rajesh Kumar moved to
  Screened."); **one step back** from his window: back to Applied.
- **Add candidate** from the Safety Officer heading → a row at Applied, "No target date".
- **Three moves forward** on that row → Offer, where the row offered "To visa & mobilisation"
  and "Onboard directly".
- **Onboard directly** asked first — "This creates … employee record at Beta Contracting Est.
  — onboarding can't be undone" with the Red-band warning — and the stage was still Offer until
  confirmed. After confirming: stage Onboarded, **one employee record created** (active), and
  the heading read "0 in the pipeline · 1 onboarded · 1/3".
- **Not selected** from a second candidate's window: gone from the sheet; rows = candidates in
  the pipeline again (13 = 13).
- **Stage filter → Not progressing** (at 375px): exactly the three candidates the data holds
  as not selected or withdrawn.
- **One list:** no headings, a Role column, most urgent first (Imran Khan, past target 6 Oct;
  Yasser Alamri, 10 Oct; Rajesh Kumar, 13 Oct). "Add candidate" at the top listed the six roles
  that can take one (not the filled one) and opened the dialog for the role picked. The choice
  was stored.
- **Withdraw** on a new role's heading: status cancelled, the heading gone, toast "… withdrawn."
- **Phone, 375px:** 13 rows under 7 headings, 0px overflow, nothing past the edge.
- **Arabic**, 375px and 1280px: 13 rows, 7 headings, 0px overflow, nothing past the edge, no
  raw key; a row reads «جراسيا ريس · الفلبين · تم الفرز · معرّض للتأخر · المستهدف 16 أكتوبر
  2026 · أُضيف قبل 80 يومًا · نقل للأمام».
- **Client manager:** "3 roles", their three roles with status and days open; no sheet, no
  button; `/candidates` answers them 403, as before.
- **Auditor** (temporary authenticator, cleared afterwards — 0 enrolled): 13 rows and 7
  headings; no Move, Add, Withdraw, Open or Close button anywhere — only the filters and the
  "Open onboarding" link.

The test candidates, the employee record the hire created and the test role were deleted, and
the database re-seeded: 14 candidates, 41 employees, 9 roles, as before.

## The colours are checked

`apps/web/scripts/verify-tints.mjs` (the department check, extended; runs in the web lint).
Extended first — it failed until the stage colours existed. It now also holds that every stage
has a colour, that the six pipeline stages are all different, that the two ways of leaving are
the same grey, and that every pair is at least 4.5:1 (least: 5.10:1).

## Checks

- `pnpm turbo run lint typecheck build` — 15 / 15.

## Stated

- The Stage filter, the client filter and the sort are not remembered; the arrangement is.
- The role actions (open, close, withdraw) are on the headings, so they are reached in the "By
  role" view.
- A real mouse click on the Stage filter misfired at the scaled 1280px size of the test
  browser; it was exercised at 375px instead.
