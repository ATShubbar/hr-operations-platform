# BILL-02 — Recording a fee at the moment of filing; receipts; a reopened step voids its fee — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-020. Card approved in advance ("approved for all"). Delivered as two commits: the API, then the screens.

## What changed

**API**

| Area | Change |
|---|---|
| Receipts | One receipt per fee. `POST /fees/:id/receipt` declares the file and returns a presigned upload; `POST /fees/:id/receipt/confirm` checks what arrived (10 MB, virus scan, real type) and marks it available, quarantined or rejected, deleting a refused file; `GET /fees/:id/receipt` returns a 300-second link for an available receipt only; `POST /fees/:id/receipt/remove` clears it. A void fee takes no new receipt; the one it has stays readable. Migration `20261012130000_billing_fee_receipts` adds four columns and a CHECK that a receipt is all present or all absent. |
| Reopened steps | GRO publishes `SequenceStepReopenedEvent` after a reopen commits. Billing subscribes and voids that step's fee, with the reason `system:step-reopened` and the reopener as the actor. A fee that is already invoiced is left. Cancelling a sequence touches no fee. |
| Storage | The file-signature check moved from Requests into Storage (`matchesSignature`), so receipts and request attachments are checked by one implementation. |
| Registries | Four more routes as `staff`; three more audited writes. |

**Screens**

| Area | Change |
|---|---|
| `components/fee-capture.tsx` | The two shared fields: **Amount paid (SAR)**, prefilled with the standard fee, and an optional **Receipt**. The help line states the standard fee and what will be recorded; an empty amount records no fee and says so. Amounts are typed in riyals and converted to halalas exactly (`lib/money.ts`); a third decimal place is refused, not rounded. |
| Mobilisation tab | Marking a step filed now asks what was paid. After the step is filed the fee is recorded by a second request and its receipt uploaded. A filed step shows "SAR 700.50 recorded · GF-…"; one with no fee offers **Record fee**. Reopening a step reports that its fee was voided, or that it stays because it is invoiced. The standard fee shown on each step now comes from the setting. |
| Procedure completion | For someone who may record fees, completing **any** procedure opens the dialog, which asks the amount paid, who it was paid to (preset by procedure type) and an optional receipt, as well as the new expiry where the type has one. |
| Failure | If the fee request fails, the filing stands and the person is told: "Filed, but the fee was NOT recorded. Add it on the client's Fees tab." A failed receipt says the fee was recorded and the receipt was not. |

## Tests

`test/billing-fee-receipts.e2e-spec.ts`, **8 tests** (written before the code; like BILL-01 they could not run until it compiled, so the rules are proven by breaking them).

- A receipt is uploaded, confirmed and then downloads as the same bytes; the Auditor can open it; the audit trail reads create, receipt-upload, receipt-confirm.
- Wrong type, over 10 MB, a blank name or an extra field is 400; confirming before the file arrives is 400; text claiming to be a PDF is rejected and never served; a refused receipt can be replaced.
- An infected file (EICAR) is quarantined and never served.
- One receipt per fee: a second is 409 until the first is removed; a void fee takes none (with and without an existing receipt).
- Officers attach and remove; the Auditor only opens; a client manager is refused; anonymous is 401.
- Reopening a step voids its fee, as the person who reopened it, audited; the step can be filed and charged again.
- An invoiced fee survives a reopen untouched and cannot be voided by hand.
- A step with no fee reopens as before; cancelling a sequence changes no fee.

**Red proofs:**

| Broken | Failed |
|---|---|
| Billing ignores the reopened step | 3 |
| GRO does not announce the reopen | 3 |
| No virus scan | 1 |
| No type check | 1 |
| A second receipt allowed | 1 |
| Any receipt is served | 2 |
| A void fee takes a receipt | 1, **after I strengthened the test** (below) |
| Every guard on an invoiced fee removed together | 2 |

**Two proofs did not bite at first, and what I did about each:**

1. *A void fee takes a receipt.* The test voided a fee that already had a receipt, so the refusal it saw was "already has one". I added a void fee with no receipt; the proof then failed as it should.
2. *An invoiced fee is protected.* There are three guards (the reopen handler skips it, the void refuses it, and the void's update is conditional on the fee being `recorded`). Removing any one alone changes nothing, because the others still refuse. Removing all three fails 2 tests. So the outcome is tested; no single guard is. The commit message for the API says "both strengthened"; only the first was, and this file is the accurate account.

**Gates:** full API suite **772/772, twice** (764 + 8). API and web `typecheck` and `lint` clean. `next build` succeeds (dev servers stopped).

## Live (HR officer, 375px; dev servers restarted)

| Check | Result |
|---|---|
| Bilal Ahmed's Mobilisation tab | Six filed steps each offer **Record fee**; each step shows its standard fee from the setting ("SAR 650", "SAR 1,800"). 0px overflow. |
| Mark filed, Iqama issued | Fields: Filed on, Amount paid (SAR) = 650, Receipt (optional). Help: "The standard fee is SAR 650. Enter what was actually paid. SAR 650 will be recorded against the client." Dialog 343px, no sideways scroll. |
| Amount `700.505` | "Enter the amount in riyals, for example 9700 or 9700.50."; the dialog stays open. |
| Amount `700.50` with a PNG receipt, submit | Five requests in order: file the step; `POST /fees` with `amountHalalas: 70050`; declare the receipt; PUT to storage; confirm. The step row reads "SAR 700.50 recorded · GF-0439". The fee: recorded, authority `muqeem` (the step's portal), paid today, receipt `available`. |
| Reopen that step | The fee is `void`, reason `system:step-reopened`, voided by "Omar Al-Shehri". The row returns to Mark filed. |
| **Record fee** on step 1 (filed 6 Sep) | Paid on is prefilled 2026-09-06, amount 2000. An empty amount is refused. `2,000` is accepted: "SAR 2,000 recorded as GF-0440."; the row shows it. |
| Complete a sponsorship transfer (no expiry) | Dialog "Complete Sponsorship transfer" with amount 2000, Paid to Qiwa, no date field; the procedure is still `approved` until confirmed. After Complete: `completed`, and "SAR 2,000 recorded as GF-0441." (authority qiwa, kind procedure). |
| Complete a work-permit renewal with the amount cleared | `completed`, expiry written, **0 fees** for that person. |
| The completion dialog in Arabic | «إكمال تجديد إقامة»; labels «تاريخ الانتهاء الناتج», «المبلغ المدفوع (ر.س)», «الإيصال (اختياري)», «الجهة المدفوع لها»; amount 9700; «الرسم المعتمد 9,700 ر.س…»; paid to «مقيم». 343px, nothing past the edge, 0px overflow. |

**One defect found and fixed during the check:** with an unreadable amount the help line said "Left empty, no fee is recorded", which was false. It now says nothing extra and leaves the error to speak. Verified after the fix.

**Not checked on screen:** the branch for someone with `gro.process` and without `fee.create`. No role is in that position today.

## The test browser, again

Twice in this card the tab left the page I was checking: once it went to the Overview while a script was running, and once a dialog my script had opened was gone by the next screenshot. I said in PROF-06 that switching the viewport caused this; that was **incomplete**. Here the viewport was set once at the start. What I can say:
- the app has no navigation to the site's root (searched: every `router.push` / `replace` and every link);
- the web server's log shows a request for the locale root just before the Overview loads;
- in PROF-06, the same steps done with real clicks instead of scripted ones kept their state.

So I still do not know the cause, only that it is on the test-browser side and that scripted clicks on menus are less reliable than real ones. Every result above was read from the API or the page after the action, not assumed.

## Data

The three walkthrough fees and their audit rows were deleted on the owner connection and the data re-seeded: 0 fees, the three touched procedures back to their seeded status, 11 filed steps as seeded. One receipt file from the walkthrough is left in the local object store with nothing pointing at it.
