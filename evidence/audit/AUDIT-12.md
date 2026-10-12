# AUDIT-12 — The Audit trail reads in plain words — Evidence

- Date: 2026-10-12
- Status: **done**
- ADR-022. Card approved in advance ("approved for all 5").

## Before

- An edit's changes were visible only inside the entry window, as raw keys and raw values:
  `employmentStatus  active → on_leave`, `assigneeUserId  2de07ea3-… → c9a07eb1-…`.
- 43 kinds of action had no sentence and showed as raw keys on the row:
  `salary-update · employee`, `reopen-step · gro-sequence`, `update · dependant`.

## Now

**On each row** — an edit carries a line with its first two changes and how many more:

    Updated pay details
    Ahmed Hassan
    Basic salary: 7,000 → 12,500 · Housing allowance: 1,750 → 3,100

**In the entry window** — every change, one per line, with the field's name, and dates in both
calendars:

    Iqama expiry      5 Nov 2026 (Jumada I 25, 1448 AH) → 3 Mar 2028 (Shawwal 7, 1449 AH)
    Passport number   — → P7654321

How a value reads:

| Recorded | Shown |
|---|---|
| a status or a fixed-list value (`on_leave`, `fixed_term`, `riyadh`) | its label — chosen by the kind of record, since `status` means different things on a request and on a procedure |
| a day | the date; with the Hijri date beside it in the entry window |
| halalas | riyals (`SAR 1,234`) |
| a pay amount | a grouped number (no currency is claimed: the entry does not say which) |
| an account id | the person's name when the page knows it, else a short id |
| a company id | the company's name |
| yes / no, lists, signatories | words |
| nothing | — |

A field or value nobody has translated still shows — the key as plain words, the value as
recorded.

In Arabic the pair runs from the right: the old value on the right, the arrow pointing left to
the new one.

## Built

- `apps/web/src/lib/audit-changes.ts` — the rules, pure: `changesOf`, `fieldLabel`,
  `fieldValue`.
- `apps/web/src/components/change-list.tsx` — `ChangeSummary` (the row line), `ChangeList`
  (the full list), `useChangeFormat`. Written to be reused by a person's History (HIST-01).
- `audit/page.tsx`, `audit/entry-dialog.tsx` use them; the page also loads the client list so a
  changed company shows by name. A record's kind now reads as a heading ("Sequence #6577…"), not
  with an article.
- Messages, both languages: 151 field labels (`auditField`), 43 action sentences and 10 record
  nouns (`audit.phrase`, `audit.noun`), the change wording (`auditChange`).

## The check — `apps/web/scripts/verify-audit-changes.mjs`, run by `pnpm lint`

The web app has no test runner, so this runs beside the Arabic-messages check. It holds:

1. the formatter's rules (33 assertions);
2. **every changeable column** of the ten records written field by field has a label in both
   languages — read from the database schema, so a column added later fails until it is named;
3. **every action** the trail can hold (the API's registry plus the twelve the server writes by
   itself: 93) has a sentence in both languages.

It found, before any screen was opened: two columns with no label, and two actions with no
sentence (`employee.terminate`, `employee.gro-completion`).

A first version of part 3 was **vacuous** — it read a file that does not list actions in the
form it looked for and reported "0 action sentences" as a pass. It now reads the registry and
refuses to run on fewer than 60 actions.

| Red proof | Result |
|---|---|
| 1 Unchanged fields listed as changes | fails |
| 2 Plumbing ids shown as changes | fails |
| 3 A status reads the same on every kind of record | fails |
| 4 Halalas shown as a bare number | fails |
| 5 An account shown as an id, never a name | fails |
| 6 Yes / no shown as true / false | fails |
| 7 A field with no label shows its raw key | fails |
| 8 A day shown as recorded | fails |
| 9 An empty value shown as nothing | fails |
| 10 Pay shown ungrouped | fails |
| 11 An Arabic field label missing | fails — after the proof itself was fixed: the first attempt removed the same text from another part of the file |
| 12 An action with no Arabic sentence | fails |
| 13 A list using the English comma in Arabic | fails |
| Restored from the staged copy, tree clean after each | passes |

## On screen (local)

Made five edits as the HR officer (profile, pay, IDs, a dependant, a request), then read the
trail as the Auditor (temporary authenticator, cleared: 10 accounts, 0 enrolled).

- **English, 1280px.** The five rows read as in "Now" above; no row on the page showed an
  action as raw keys (0 of the first 50); 0px overflow.
- **Entry window, English.** "Employment status: Active → On leave"; dates in both calendars.
- **Arabic, 375px.** «الراتب الأساسي: 7,000 ← 12,500 · بدل السكن: 1,750 ← 3,100». Measured:
  the old value is to the right of the arrow and the new one to its left. 0px overflow, in the
  page and in the entry window.

**Caught on screen and fixed:** on a phone the Arabic line was cut at its START — the field's
name was hidden and only the end of the line showed. The `truncate` rule (UX-23) reads a line
that is one right-to-left run inside an element as having no direction. The cut element is now
given the direction itself. Measured after: on all five rows the first field's name starts at
the row's right edge.

The sample data was put back: re-seeded, plus the one value the seed does not rewrite.

## Checks

- `pnpm turbo run lint typecheck build` — 15 / 15.
- No API change in this card.

## Stated

- Entries written before AUDIT-11 have nothing to show for most employee edits; they read
  "No field values were recorded for this entry."
- A new record's row has no summary line — its fields are in its window.
- Days are shown as calendar days (read in UTC), so a reader in any timezone sees the day
  that was recorded.
