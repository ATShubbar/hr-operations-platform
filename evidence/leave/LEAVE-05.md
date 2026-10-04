# LEAVE-05 — Balances tab, the Person record's Leave tab, Run carry-over — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → LEAVE-05 (ADR-014 rev. 1). Status: **done**. **No API change.**

## What was built

| File | What |
|---|---|
| `(app)/leaves/balances-tab.tsx` | The prototype's "Annual leave balances" table, in its 7-column grid: Employee ("21 a year"), Client, Accrued, Carried, Taken, Booked, Available (bar, red when overdrawn). **Added: a search box** (Arabic-folded). Staff rows link to `/employees/:id?tab=leave`; client managers' rows aren't links (they have no staff person record). Below ~640px the table scrolls inside a keyboard-reachable region (UX-11). |
| `(app)/employees/[id]/leave-tab.tsx` | The prototype's Leave tab: available (red when overdrawn) + the Art. 109 basis (21 / 30 wording); a taken / booked / remaining bar with legend; overdrawn note; four figures (accrued, carried, sick, unpaid); the carried note ("N days carried from {year}, capped at 10" / "Nothing carried…"); the pending note; **leave history** across years (type + reference, days, dates, Paid/Unpaid, Taken/Booked pill; a spell crossing the year end shows as its two parts); **Request leave** pre-selected for this person (hidden for leavers). |
| `employees/[id]/page.tsx` | `?tab=<tab>` opens a tab directly (read from `window.location`, not `useSearchParams`, for the reason in DS-08). The Leave tab is no longer "coming soon". |
| `leaves/request-leave-dialog.tsx` | Optional `preselect`. |
| `(app)/settings/leave-carry-over.tsx` | Settings → System (shown for `leave.carry-over`, the Administrator): leave year (defaults to this year) + company (or every company), a confirmation, then the result line. |
| `messages/{en,ar}.json` | `leaves.bal`, `leaves.person`, `leaves.carryOver`. The dead `leaves.balancesSoon` and `person.soon.leave` are removed. |

## Verified live (local dev)

### The figures, worked by hand first, then read off the screen

Today in Riyadh is 4 October 2026, so 1 January → 4 October is 276 days, which gives `floor(276 / 30.44) + 1 = 10` months. All three were hired before 2026 and under 5 years ago (21 days), so each has accrued `round(21 / 12 × 10) = 18`.

| Person | From the database | Expected | Balances row (screen) |
|---|---|---|---|
| Ibrahim Diab | annual 12–14 Oct (ends after today → booked) | 18 · 0 · 0 · **3** → **15** | `18 · 0 · 0 · 3 · 15` ✔ |
| Abdullah Alqahtani | annual 3–7 Oct (ends after today → booked) | 18 · 0 · 0 · **5** → **13** | `18 · 0 · 0 · 5 · 13` ✔ |
| Ahmed Hassan | nothing filed; 4 days approved, not yet filed | → **18**, pending 4 | `18 · 0 · 0 · 0 · 18` ✔ |

- **Rows:** 36, matching the database's 36 people still employed (39 in total, 3 terminated).
- **Row → record:** clicking Abdullah's row opened `/en/employees/…?tab=leave` with **the Leave tab active**. It showed 13 available, "0 taken · 5 booked ahead · 13 remaining", accrued 18, "Nothing carried from 2025", and history `Annual leave LV-0393 · 5 days · 3 Oct 2026 — 7 Oct 2026 · Paid · Booked`.
- **Ahmed's record:** 18 available and **"4 days awaiting a decision, not yet deducted."**

### Arabic at 375px

- **Balances:** 0px page overflow; the table scrolls inside its region (`scrollWidth > clientWidth`, `tabIndex 0`); no missing keys.
- **The Leave tab:** 0px overflow, correct plurals ("5 أيام"), the same figures.

### Run carry-over (Administrator)

The seed administrator was enrolled in TOTP temporarily (the established local practice). The confirmation read: "Credit unused annual leave from 2025 into 2026? It's safe to run again — anyone already credited for 2026 is skipped."

- First run: **"2026: 36 credited · 0 already credited · 0 with nothing to carry."**
- Second run: **"2026: 0 credited · 36 already credited · 0 with nothing to carry."**

**Local data restored:** there were 0 carried rows before the run. The 36 test credits were deleted and the administrator's TOTP secret cleared (`0 | 0` read back afterwards). The browser was signed out.

Web typecheck + lint clean.
