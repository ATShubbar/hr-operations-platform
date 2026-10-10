# BILL-03 — The client's Fees tab — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-020. Card approved in advance ("approved for all"). No API change.

## What changed

`clients/[id]/fees-tab.tsx`, mounted as the Client record's **Fees** tab (it said "coming soon"):

| Part | What it shows |
|---|---|
| Four tiles | Paid on their behalf · 90 days · **Not yet invoiced** · Already recovered · 90 days · Filings · 90 days |
| Where the money went | Fees of the last 90 days by authority, with a bar and the amount |
| Fee ledger | Reference, what was paid for, the authority and the person (or "Company-level"), the day paid in both calendars, the amount, the status, and a paperclip that opens the receipt. A **Show** filter: all but void, not yet invoiced, invoiced, void. |
| Actions (officers and the Administrator) | **Add a fee** by hand; per fee: Correct (while recorded), Attach or Remove the receipt, Void with a reason. |

**One deliberate change from the prototype:** its "Not yet invoiced" counts only the last 90 days. Here it is every fee still recorded, whatever its age, because an old unbilled fee is still owed. The tile says "all of it, whatever its age".

A void fee is in none of the figures, is shown only under **Void**, with its amount struck through and its reason. Text in the ledger wraps and is never cut with an ellipsis, so a row cannot hide what was paid for.

## Live (375px; sample fees created through the API for one company)

Fees: 150 (3 days ago), 600 (120 days ago), 100 (10 days ago, then marked invoiced by SQL), 2,000 for a procedure (yesterday), and 50 voided.

| Check | Result |
|---|---|
| Tiles against SQL | Paid 90 days **SAR 2,250** (SQL 225000 halalas) · Not yet invoiced **SAR 2,750** (275000, includes the 120-day-old fee) · Recovered **SAR 100** (10000) · Filings **3**. All four match. |
| Where the money went | Qiwa SAR 2,100 at 93%, Chamber of Commerce SAR 150 at 7%. SQL: qiwa 210000, chamber 15000. |
| Ledger order and default view | Newest payment first; the void fee is not listed. Nothing extends past the card; 0px overflow. |
| Add a fee, empty form | "Say what was paid for."; the dialog is 343px with no sideways scroll. |
| Add a fee (Balady, 350) | "SAR 350 recorded as GF-0447."; tiles move to 2,600 / 3,100 / 100 / 4. |
| The invoiced fee's menu | Only "Attach a receipt". No Correct, no Void. |
| Correct GF-0447 to 375.25 | The request body is exactly `{"amountHalalas":37525}`; the row and the tile (2,625.25) follow. The dialog has no receipt field. |
| Void without a reason | "Give a reason (at least a few words)."; **0 requests**. |
| Void with a reason | Body `{"reason":"Licence was paid by the client directly"}`; tiles return to 2,250 / 2,750 / 100 / 3. |
| Show → Void | Both void fees, each with "Void — {reason}", amounts struck through, no action buttons; the tiles do not change. |
| Attach a receipt from a fee's menu | The receipt is `available`; a paperclip appears titled with the file name; the link returns the same 32 bytes that were uploaded. |
| Auditor, Arabic | Tiles «2,250 ر.س», «2,750 ر.س», «100 ر.س», «3»; rows translated («نقل كفالة», «قوى · راجيش كومار», «مسجّل»). **The only button in the ledger is the Show filter**: no Add, no row actions. 0px overflow. |

A fee's manual wording is shown as typed (an English label stays English on the Arabic screen), as with every other free text.

## Defect found and fixed during the check

The ledger's two text lines were truncated at phone width, cutting "Company-level (no employee)" short. They now wrap. Re-measured: nothing past the card's edge.

## Not clicked in this card

Removing a receipt and opening one in a new browser tab. The attach path and the download link were checked; the remove route is covered by BILL-02's tests.

## Gates

- Web `typecheck` and `lint` clean. `next build` succeeds (dev server stopped; built before the wrap fix, after which `typecheck` and `lint` were re-run, and the next card rebuilds).
- No API change: API suite stands at 772/772.

## Data

All sample fees and their audit rows were deleted on the owner connection (0 fees). The Auditor seed account's temporary authenticator enrolment was cleared (0 enrolled). The test browser left the page once more during this check; results above were re-read after returning.
