# BILL-05 — Invoice records — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-020. Card approved in advance ("approved for all").

## What changed

**Data.** `bil_invoices`: the record of an invoice issued from the accounting system. Its number as issued, issue date, due date, amount (whole halalas), `sent` or `paid`, and the day it was paid. Staff-owned: `app_staff` may read, insert and update (no delete); `app_client` and `app_employee` have no grant. `bil_fees` gains `invoice_id`, a real foreign key. Migration `20261014120000_billing_invoices`.

The database enforces, whoever writes:

| Rule | How |
|---|---|
| One live record per number per client, whatever its case | partial unique index on `(client_id, lower(number))` where not removed |
| A number, a positive amount, not due before it was issued | CHECKs |
| `paid` means there is a day it was paid, and only then; not before issue | CHECK |
| A paid record is never a removed one | CHECK |
| A fee is `invoiced` exactly when it points at an invoice that exists | CHECK + foreign key |

**API** (`modules/billing`, `billing.read` / `billing.update`, staff only through `scopeOf`):

| Route | What it does |
|---|---|
| `GET /billing/clients/:clientId/invoices` | The live records, newest issue first, each with the fees it recovers and `overdue` |
| `POST /billing/clients/:clientId/invoices` | Records one, with the fees it recovers. All or nothing: every fee must be this client's and still `recorded`. |
| `PATCH /billing/invoices/:id` | A correction while unpaid. `feeIds` replaces the set; a fee left out goes back to `recorded`. |
| `POST /billing/invoices/:id/paid` | Marks it paid, with the day |
| `POST /billing/invoices/:id/unpaid` | Undoes a "paid" set by mistake |
| `POST /billing/invoices/:id/remove` | Soft removal, only while unpaid and recovering no fee. Frees the number. |

`GET /billing/clients/:clientId` (BILL-04) now also returns `standing`: `none` when no invoice is recorded, `current` when nothing unpaid is past its due date, `overdue` otherwise, with the outstanding and overdue amounts. It is derived each time from the records and today's date in the system timezone. Nobody sets it.

Every write is audited as `invoice` (`create`, `update`, `paid`, `unpaid`, `remove`) with before and after, including the references of the fees recovered. Graded notable; a removal is critical. Every write locks the invoice's row first, so linking a fee and removing the record cannot interleave.

**Screen** (Client record → Commercial):

| Part | What it shows |
|---|---|
| Overdue banner | "Payment overdue — 1 invoice past its due date, SAR 12,645. SAR 26,290 outstanding in all." Only when overdue. |
| Account standing (Agreement card) | No invoices recorded · Up to date · Overdue, with the amount awaiting payment |
| Invoices | Number, the fees it recovers, issue date, due or paid date, amount, and Sent / Paid / Overdue. A note says these are records of invoices issued elsewhere. |
| Record an invoice (Administrator) | Number, amount, issue date, due date (follows the issue date by the payment terms until changed), and a tick list of the fees still waiting, with a running total |
| Per record | Mark as paid (asks the day) · Mark as unpaid · Correct · Remove (offered only when unpaid and recovering no fee; asks first) |

The invoice list takes the full width and the tier list follows it. The prototype sets them side by side, but a record here carries more than the prototype's four columns.

## Tests

`apps/api/test/billing-invoices.e2e-spec.ts` (10). Written before the table and the service, so it could not run red first. Each rule was proven by breaking it:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | Staff check removed | yes (widened-policy test) |
| 2 | Link takes a fee in any status | yes |
| 3 | Link takes another client's fee | yes |
| 4 | Link does not insist on every fee | yes |
| 5 | No records reads as "current" | yes |
| 6 | A paid record can be corrected | yes |
| 7 | A record recovering fees can be removed | yes |
| 8 | A paid record can be removed | yes |
| 9 | A dropped fee stays invoiced | yes |
| 10 | Duplicate number not mapped to 409 | yes |
| 11 | A removed record still answers | yes |
| 12 | No audit entry on create | yes |
| 13 | Issue date may be in the future | yes |
| 14 | Paid-before-issue not checked by the service | yes (the CHECK then answers 500, not 400) |
| 15 | Already-paid not refused | yes |
| 16 | Auditor gains `billing.update` | yes (and the role matrix) |
| 17 | `app_client` granted SELECT | yes |
| 18 | `app_staff` granted DELETE | yes |
| 19 | Paid CHECK dropped | yes |
| 20 | Removed CHECK dropped | yes |
| 21 | Number index dropped | yes |
| 22 | Fee invoice CHECK dropped | yes |
| 23 | Fee → invoice foreign key dropped | yes |
| 24 | Due today counts as overdue | yes |

All 24 failed as expected. Files restored and compared byte for byte; constraints, the index and grants re-read from the database; the schema and the database show no drift.

Earlier billing tests marked a fee `invoiced` by SQL alone. With the new CHECK that is no longer possible, so they now put the fee on a real invoice record (through the API in the terms spec).

- API suite: **790/790** (780 + 10). Contracts 22/22. Lint and typecheck clean. `next build` passes.

## Live (local, seed company Alpha; rows removed afterwards)

Terms: 45-day payment terms. Three fees recorded by hand: SAR 150, 650 and 200.

| Check | Result |
|---|---|
| Before | Standing "No invoices recorded". Not yet recovered SAR 1,000. |
| Record INV-2026-0091, SAR 13,645, two fees ticked (650 + 150) | Due date prefilled 45 days after issue. Running total "2 fees ticked · SAR 800". Saved: row "Recovers 2 fees · SAR 800 · Sent"; not yet recovered **SAR 200**; next-invoice estimate SAR 12,845 (12,645 + 200); standing "Up to date · SAR 13,645 awaiting payment". |
| A second record due five days ago, SAR 12,645 | Row "Overdue"; banner "Payment overdue — 1 invoice past its due date, SAR 12,645. SAR 26,290 outstanding in all."; standing "Overdue". |
| Mark as paid (today) | Row "Paid 10 Oct 2026 · Paid"; banner gone; standing "Up to date". Its menu then offers only **Mark as unpaid**. |
| Mark as unpaid | Overdue again, banner back. |
| Remove (unpaid, no fees) | Asks first; the record leaves the list; banner gone. |
| Menu of the record that recovers fees | Mark as paid, Correct. **No Remove.** |
| Correct: untick the SAR 150 fee | Row "Recovers 1 fee · SAR 650"; that fee is `recorded` again (API); not yet recovered SAR 350; the Fees tab's "Not yet invoiced" tile reads SAR 350. |
| Auditor | Sees both records and the banner; **0 buttons** on the tab. |
| Arabic, 375px | No missing keys; 0px overflow; nothing wider than the screen. Dates and counts read correctly. |

Temporary authenticator enrolments were cleared (0 enrolled); the fees, invoices and terms were deleted; the seed was re-run after the suite.

## Stated plainly

- **"Mark as unpaid" is an addition.** ADR-020 says an invoice is sent until marked paid. A hand-kept record needs a way to undo a wrong click, so the un-mark exists, is audited, and is the only way to correct a paid record.
- **Linking a fee writes no separate `fee` audit entry.** The invoice's entry lists the fee references before and after.
- **The amount is not checked against the fees.** It is entered as issued (it normally includes the subscription and tax). The screen shows the total of the ticked fees beside it for the person to compare.
- **The Fees tab does not show which invoice recovered a fee.** Officers see "Invoiced"; the number is on the Commercial tab, which they cannot open. Adding the number to the ledger is a small follow-up if wanted.
- **"Today" is the system timezone's date** (Asia/Riyadh). The test counts its days the same way: measured in UTC, "due today" would read as overdue between midnight and 03:00 in Riyadh, and the test would have failed in CI during those hours.
- **The estimate does not know what a recorded invoice already covered.** "On the next invoice" is still the cycle amount plus the fees not yet recovered.

## Test-browser notes

- A scripted tick of a checkbox set the box without telling the form, so the running total stayed at zero. Real clicks (on the box or its label) work. Not an app fault.
- The test browser twice reset the page to the home screen mid-check. Results were re-read from the page and the API after each action.
