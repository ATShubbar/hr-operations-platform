# SOON-04 — Candidate target date and health — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("let's work on the rest 3 points now"). Owner decision: health is "worked out
  from the target date" — nobody types it.
- No ADR: one optional field on a table Recruitment already owns; no new permission, no new
  route, the role matrix is unchanged.

## What it does

A candidate's window had shown "Health · Soon" and "Target · Soon". Both are real now.

- A candidate can have a **target date** — the day they are meant to be in post. It is optional.
  It is set when the candidate is added, or later from their window ("Set a date" / "Change",
  with Save, Clear and Cancel).
- **Health is worked out from it**, on the card and in the window:

| Health | When | Colour |
|---|---|---|
| On track | more than 4 days remain | green |
| At risk | 4 days or fewer remain, the target day itself included | amber |
| Past target | the target day has passed | red |
| *(none)* | no target date, or the candidate is finished (onboarded, rejected, withdrawn) | — |

- A card with no target date shows no pill; the window says "No target date".
- The window adds a plain line: "19 days to the target", "The target is today", or
  "6 days past the target".

## How

- **One rule, in one place:** `candidateHealth({ targetDate, stage, today })` in
  `@hr/contracts/candidate-health` (no validation library in it, so the browser can import it).
  Whole calendar days; `AT_RISK_DAYS = 4`.
- **Health is never stored.** Only `rec_candidates.target_date` (a date, nullable) is — migration
  `20261020120000_candidate_target_date`. Health is worked out in the browser against the
  viewer's own day, so it moves on at their midnight without anyone saving anything.
- API: the candidate response carries `targetDate` (`YYYY-MM-DD` or `null`); create accepts it;
  `PATCH /candidates/:id` accepts a day, or `null` to clear. A value that is not a real day is
  refused (400). Existing permissions: `candidate.create` / `candidate.update`. The change is
  audited as an ordinary candidate update.
- Client managers still see roles and counts only — they hold no `candidate.read`, so no target
  date or health reaches them.
- Seed: the sample candidates carry target dates relative to seed day, so a fresh seed shows all
  three states and a candidate with none.

## Tests

`packages/contracts/src/candidate-health.test.ts` (6) and
`apps/api/test/candidate-target-date.e2e-spec.ts` (5), written first.

| Red proof | Tests that fail |
|---|---|
| 1 At risk from three days, not four | 1 |
| 2 The target day itself counts as past | 1 |
| 3 A finished candidate is still judged | 1 |
| 4 No target date reads as "on track" | 1 |
| 5 Days counted from the wrong end | 5 |
| 6 The day is stored in a local timezone (it comes back a day early) | 2 |
| 7 An update ignores the target date | 1 |
| 8 `null` does not clear it | 1 |
| 9 Any text is accepted as a date | 1 |
| 10 The response leaves the date out | 2 |
| Restored (three files byte-identical, `cmp`) | 6 / 6 and 5 / 5 |

## On screen (local, seed data, today = 11 Oct 2026)

Signed in as the HR officer.

- **Board, English, 1100px.** Every card with a target shows the health that follows from it:
  Rajesh Kumar *At risk* (12 Oct) · Noura Alharbi *At risk* (14 Oct) · Gracia Reyes *At risk*
  (15 Oct, exactly four days) · Yasser Alamri *Past target* (9 Oct) · Imran Khan *Past target*
  (5 Oct) · Mazen Alotaibi, Salem Alqahtani, Layla Almansour, Maria Santos, Bilal Ahmed
  *On track*. Dana Alfaisal, who has no target, has no pill. 0px overflow.
- **Set, Arabic, 375px.** Dana's window read «لا يوجد موعد مستهدف». Set 14 Oct →
  `PATCH /api/candidates/…` `{"targetDate":"2026-10-14"}` → 200; the window read «معرّض للتأخر»
  and «3 أيام حتى الموعد المستهدف», the card behind it showed the pill and the date. The window
  fits the phone, 0px overflow.
- **Change and clear, English, 375px.** Set 30 Oct → "On track · 19 days to the target", toast
  "Target for Dana Alfaisal set to 30 Oct 2026." Clear → "No target date", toast "Target date
  cleared for Dana Alfaisal.", and the API returns `targetDate: null`.
- **Add candidate.** Added one with target 13 Oct through the form → stored `2026-10-13`; the
  new card read "At risk · Target 13 Oct 2026". (Test candidate removed afterwards.)
- **Auditor.** Sees the health and the target on cards and in the window; the window offers
  only Close — no "Set a date", no "Change". (Temporary authenticator cleared afterwards:
  10 accounts, 0 enrolled.)

## Checks

- API suite **947 / 947** (942 + 5). Contracts 40 / 40.
- `pnpm turbo run lint typecheck build` — 15 / 15. Arabic messages guard: plain text in the
  file, wording unchanged by the rule.
- Database re-seeded after the suite.

## Limits, stated

- "Today" is the viewer's own day, not the system timezone's — two people either side of
  midnight can see a one-day difference for a few hours.
- Health looks only at the target date. It does not look at how long a candidate has sat in a
  stage, and nothing is sent to anyone when a candidate becomes at risk or past target — the
  bell and the work queue do not include candidates.
- The window's "Mobilisation" fact and "Documents and comments" block are unchanged.

## After deploy

Run **Seed UAT (seed-and-smoke)** once the pipeline has finished: this card adds a migration and
changes the seed (as SOON-03 did; SOON-01 added two smoke checks).
