# CSV-01 — Formula guard on every export — Evidence

- Date: 2026-10-12
- Status: **done**
- Card approved ("approved for both"). Follow-up filed by SOON-01.

## The problem

A spreadsheet runs a cell that opens with `=`, `+`, `-` or `@` (or a tab or a carriage return)
as a formula. The People export (SOON-01) already wrote such cells as text. The report export
and the audit-trail export did not: a company or an account named `=HYPERLINK(...)` would run on
whoever opened the file.

## The change

The guard moved into the one CSV writer, `apps/api/src/csv/csv.ts` → `csvField`. Every TEXT cell
of every export passes through it — the three that exist and any written later. A guarded cell
gets a leading apostrophe, which Excel and Sheets show as text.

- Numbers are passed as numbers and are never touched (`-12.5` stays a number).
- The guard runs before quoting, so the apostrophe sits inside the quotes of a quoted cell.
- `csvText` (used by the People export) now only turns "no value" into an empty cell; the guard
  is no longer its job, so no cell is guarded twice.
- The audit export's fingerprint is taken from the finished file, so it still matches the bytes.
- No database change, no new permission, no screen change.

## Tests — `apps/api/test/csv-formula-guard.e2e-spec.ts`

7 tests, written first: 4 failed against the old writer; 3 passed and stay as guards on what
must NOT change (numbers, ordinary text, no double guard).

- The writer: each of the six opening characters; negative numbers; ordinary text, dates and
  empty cells; a formula that also needs quoting; no second apostrophe.
- A real report export with two companies named `=HYPERLINK("http://x","Al Noor")` and
  `+966 Trading` — both written as text, and no line of the file opens with a formula character.
- A real audit export for an account named `@SUM(A1:A9)` — written as text; the recorded
  values (JSON) are unchanged; the audit row's SHA-256 equals the downloaded bytes'.

| Red proof | Tests that fail |
|---|---|
| 1 No guard at all | 4 |
| 2 Quoted first, apostrophe outside the quotes | 3 |
| 3 Numbers guarded like text | 1 |
| 4 A leading minus let through | 1 |
| 5 A leading tab or carriage return let through | 1 |
| 6 Only `=` guarded | 3 |
| Restored (byte-identical, `cmp`) | 7 / 7 |

## Checks

- The four export specs together (new guard + People + reports + audit): 31 / 31.
- API suite **954 / 954** (947 + 7). API lint and typecheck clean.

## Side effects, stated

- Typed text that legitimately opens with `+` or `-` (a phone number, say) carries a leading
  apostrophe in the raw file. Excel and Sheets hide it; a text editor shows it. The People
  export already behaved this way.
- In the audit export the Before / After cells are JSON and open with `{`, `[` or `"`, so they
  are unchanged. A recorded value that was a bare negative number would gain the apostrophe;
  no audited write records one.
