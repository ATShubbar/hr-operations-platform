# BILL-06 — Reports figures, the dependant fee, the standard-fees editor, sample data — Evidence

- Date: 2026-10-10
- Status: **done**. This closes the Billing epic (BILL-00..06, ADR-020).
- Card approved in advance ("approved for all"). No API change: every figure comes from routes built in BILL-01..05.

## What changed

| Where | Before | Now |
|---|---|---|
| Reports → tile "Fees · 90 days" | "Soon" | The fees paid in the last 90 days, with "SAR X not yet recovered, whatever its age" beneath |
| Reports → "Government fees by client" | "Coming soon" | One bar per active company (and any other company a fee was paid for), largest first, each linking to the client. The rows add up to the tile. |
| Person record → Family tab header | "annual dependant fees coming soon" | "2 dependants sponsored · SAR 9,600 a year in dependant fees at the standard SAR 4,800 each" |
| Add / Edit dependant dialog | "annual dependant fees coming soon" | "The standard dependant fee is SAR 4,800 a year. A payment made is recorded on the client's Fees tab." |
| Settings → System | no editor | **Standard fees**: 8 procedure types, 11 onboarding steps, 8 final-exit steps and the annual fee per dependant (Administrator) |
| Seed | no billing data | Terms for 4 companies, 10 fees, 4 invoice records |
| UAT smoke check | no billing step | 4 read-only checks |

**Reports figures.** Two reads of the fee ledger: fees paid in the last 90 days (void left out), and every fee still `recorded` at any age. "Not yet recovered" is what is owed, and an old unbilled fee is still owed; this is the same deliberate change from the prototype as on the client's Fees tab. If the ledger cannot be read the tile shows a dash and says so. It never shows zero for a failed read.

**The dependant fee stays information** (ADR-020). The Family tab multiplies the standard annual figure by the number of dependants. It is not a record of any payment. If the Administrator sets the figure to 0 the fee part of the line is left out.

**Standard-fees editor.** Each box takes riyals; 0 means no fee is expected, and a box is never blank. The whole set is saved at once because the API requires every key. Save is disabled until something changes, and while any box is not an amount from 0 to 1,000,000 with at most two decimals. After a save the filing dialogs' cached figures are dropped, so the next dialog prefills the new amount. The subtitle says the starting figures are not checked against the authorities' tariffs.

## Sample data (seed)

Every date is relative to seed day. Fee references are fixed (`GF-S01` to `GF-S10`, S for sample) so re-seeding does not use up the real `GF-0001…` sequence. Invoice amounts are the cycle's subscription plus the fees recovered, with no tax, so a reviewer can add them up.

| Company | Terms | Fees | Invoice records | Standing |
|---|---|---|---|---|
| Alpha | SAR 3,500 + 65 per employee, quarterly, 30 days | iqama fee 650 (invoiced) · chamber 150 · **work-permit levy 9,700, 130 days old, still owed** · one void | INV-2026-0412, SAR 13,295, paid | Up to date |
| Beta | SAR 6,000 + 55, monthly, 45 days | exit re-entry 200 for a completed procedure (invoiced) · municipality 1,200 | INV-2026-0455, SAR 6,495, **15 days past due** · INV-2026-0478, SAR 6,695, within terms | **Overdue** |
| Najd | SAR 3,500 + 65, quarterly, 30 days | three steps of Bilal Ahmed's onboarding: block visa 2,000 (invoiced), visa stamping 200, medical 300 | INV-2026-0481, SAR 14,060, sent | Up to date, awaiting payment |
| Gulf Medical | SAR 1,500 + 45, annual, 60 days | block visa 2,000 for Maria Santos | none | No invoices recorded |
| Al Waha (archived) | none | none | none | none |

The seed replaces its own fees and invoices and anything that would collide with them (a record with a seeded number, a live fee for a seeded step or procedure). A fee someone linked by hand to a seeded invoice goes back to waiting first. Terms are written whole. **Ran twice in a row with no error**, and again after the full test suite.

## Checked against the database

| Figure | Screen | SQL |
|---|---|---|
| Fees paid, 90 days (not void) | SAR 6,700 | 670,000 halalas |
| Not yet recovered, any age | SAR 13,550 | 1,355,000 halalas |
| By client | Najd 2,500 · Gulf 2,000 · Beta 1,400 · Alpha 800 | 250,000 · 200,000 · 140,000 · 80,000 |
| Beta, Commercial tab | 9 employees × 55 + 6,000 = SAR 6,495 a month; not yet recovered SAR 1,200; banner "1 invoice past its due date, SAR 6,495. SAR 13,190 outstanding in all." | terms and invoices as seeded; 6,495 + 6,695 = 13,190 |

The 130-day-old fee (SAR 9,700) is in "not yet recovered" and in neither 90-day figure. The void fee is in none.

## Live

| Check | Result |
|---|---|
| Reports (Administrator) | Tile and panel as above; no missing text; 0px overflow |
| Standard fees: 28 boxes, labels from the procedure and step names | Yes. Dependant box reads 4800. Save disabled. |
| Type 12.345 in a box | "Each box needs an amount in riyals from 0 to 1,000,000, with at most two decimal places."; the box is marked invalid; Save disabled |
| Change the dependant fee to 5000 and save | Saved as 500,000 halalas; every other figure unchanged; Save disabled again |
| Family tab after the change | "2 dependants sponsored · … SAR 10,000 … at the standard SAR 5,000 each" (Arabic checked) |
| Restored to 4800 | English: "SAR 9,600 a year in dependant fees at the standard SAR 4,800 each". Arabic: «مُعالان على الكفالة · 9,600 ر.س سنويًا رسوم مُعالين بالرسم القياسي 4,800 ر.س لكل مُعال» |
| UAT smoke check, run against the local servers | The three billing checks that run without the Administrator pass; all other checks pass |

- API suite **790/790** with the billing sample data in place. Lint and typecheck clean. `next build` passes.
- Temporary authenticator enrolments cleared (0 enrolled).

## Stated plainly

- **The Administrator's billing check in the smoke script was not run locally.** Locally the Administrator must use an authenticator, so the script skips that account; it runs on UAT. The same reading (Beta: monthly terms, overdue) was confirmed on screen.
- **No test was added in this card.** It adds no API. The seed is exercised by CI, which seeds before the suite; the database constraints then prove the sample rows are well-formed.
- **No receipts are seeded.** The paperclip appears only on fees recorded with a receipt by hand.
- **The standard figures are still the design's.** The editor exists so the Administrator can correct them; nobody has checked them against the authorities.
- **The Reports page reads the whole "recorded" ledger.** That is fine at this size. If the ledger grows large, the totals should come from the API instead.
- I first wrote the new Arabic lines with a different word for "dependant" than the Family tab uses, and corrected them to the tab's own word before shipping.

## After this card: for the owner

Run **Seed UAT** (GitHub → Actions → Seed UAT → `seed-and-smoke`) once the deploy is live. It resets the sample data and the seed accounts, as before, and adds the billing data above.
