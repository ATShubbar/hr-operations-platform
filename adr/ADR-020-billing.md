# ADR-020 — Billing: government fees, commercial terms and invoice records

- Status: Accepted
- Date: 2026-10-10
- Owner: Ahmed Alshubbar (product decision; BILL-00)
- Amends: **architecture.md**. Billing leaves "future" and becomes a module; the permission catalog and matrix gain two rows. Now **v1.14**.

## Context

PEOPLE&GRO pays government fees on its clients' behalf and recovers them, and charges each client a subscription. The app knows none of this today. Wherever money would appear it says "coming soon":

- the Client record's **Fees** and **Commercial** tabs;
- the fee shown on each onboarding and final-exit step ("recording fees comes with billing", ADR-018);
- the dependant fee on the Family tab (ADR-017);
- the Reports tile and panel for government fees.

The prototype shows three things on the Client record:

1. **A fee ledger** (Fees tab, all staff): each fee paid on the client's behalf, with its authority, employee, date, amount, receipt, and a status of *Recorded* or *Invoiced*. A fee is recorded when a procedure is resolved or a sequence step is filed, and reversed when a step is reopened.
2. **A subscription** (Commercial tab, administrators only): a platform fee plus a rate per employee, a billing cycle, a purchase order, payment terms, and an account standing.
3. **Invoices** (Commercial tab): a list with a reference, issue date, amount and status. The prototype **fabricates** this list from a formula; nothing is issued or stored.

Two facts shaped the decision:

- An invoice issued in the Kingdom is a tax document. architecture.md already notes that ZATCA (Fatoora) e-invoicing "activates with Billing". **This ADR does not verify ZATCA's current requirements**, and it takes no position on how VAT applies to pass-through government fees. Both are for the owner's accountant.
- This is the first module that holds money. A wrong default is expensive to undo.

## Options considered

1. **The app issues tax invoices.** Rejected for now: it requires e-invoicing compliance that has not been verified, a tax advisor, and onboarding with the authority.
2. **Fees and terms only, no invoices.** Workable, but fees could never leave "not yet invoiced", so the ledger would never say what has been recovered.
3. **Record invoices here, issue them elsewhere** (chosen).

## Decision (owner decisions marked ★)

### Scope

- ★ **Tax invoices keep being issued from the owner's accounting system.** The app records each one: its number as issued, issue date, amount, and whether it has been paid. It also records which fees that invoice recovered.
- **The app does not issue, number, or render an invoice, and does not calculate VAT.** An invoice's amount is entered as issued.
- The app does work out **what is due**: the subscription for the cycle plus the fees not yet recovered. It is shown as an estimate and labelled as one.

### The fee ledger

- A **fee** is one payment made to an authority on a client's behalf. It has a reference (`GF-0001…`), the client, optionally the employee it was for, what it was for, the authority, the amount, the day it was paid, who recorded it, and optionally a receipt (PDF, JPG or PNG, scanned like every other upload).
- ★ **Staff confirm the amount paid.** When a sequence step is filed or a procedure is completed, the dialog shows the standard fee prefilled. The person filing confirms or corrects the amount actually paid and may attach the receipt. An amount of zero records no fee. A fee can also be added by hand on the client's Fees tab, for example for a company-level payment that belongs to no employee.
- A fee tied to a step or a procedure can be recorded **once**. The database enforces it.
- **Status:** *recorded* (not yet on an invoice) → *invoiced* (an invoice record recovers it). A fee can also be *void*: recorded in error, or its step was reopened.
- **Nothing is deleted.** A void fee stays in the ledger with who voided it and why.
- **A fee that is already on an invoice is never voided.** Reopening its step leaves the fee in place and says so. A fee not yet invoiced is voided when its step is reopened, as the prototype reverses it.
- An amount may be corrected only while the fee is *recorded*.

### Standard fees ★

- ★ **The standard amounts are a setting the Administrator edits**: one per procedure type, one per sequence step, and the annual fee per dependant. They are seeded with the prototype's figures.
- A standard fee is only what the dialog prefills. Changing it never alters a fee already recorded.
- **The prototype's figures are not verified here.** They are a starting point for the Administrator to correct.
- **The dependant fee stays information.** The Family tab shows the standard annual figure. An actual payment is recorded by hand on the Fees tab against that employee.

### Commercial terms

- One set per client: a platform fee, a rate per employee, the billing cycle (monthly, quarterly, annual), a purchase-order number and payment terms in days.
- The tier and the term dates stay where ADR-019 put them, on the client's profile. The Commercial tab shows them beside the terms.
- **The estimate:** platform fee plus the rate times the people under management at that client (the shared headcount rule, REP-06), times the cycle's months, plus the fees not yet recovered.

### Invoice records

- An **invoice record** has the number as issued (no two for one client share a number), the issue date, a due date (prefilled from the payment terms), the amount, and optionally the fees it recovers.
- Linking a fee to an invoice makes the fee *invoiced*. A fee can be on one invoice only.
- An invoice is *sent* until an Administrator marks it *paid*, with the day it was paid.
- ★ **"Overdue" is derived**: an unpaid invoice past its due date. A client's standing is overdue when it has one. Nobody sets a standing by hand.
- An invoice record entered in error can be removed only while no fee is linked and it is unpaid; otherwise it is corrected, not removed. Removal is soft.

### Who ★

★ **Staff keep the ledger; the Administrator keeps the terms.**

| | Administrator | HR officer | GRO officer | Auditor | Client manager | Employee |
|---|---|---|---|---|---|---|
| Government fees | record, correct, void, read | record, correct, void, read | record, correct, void, read | read | – | – |
| Commercial terms and invoice records | read, change | – | – | read | – | – |
| Standard fees (a system setting) | change | – | – | read | – | – |

- New permissions, within the catalog's verb set: `fee.read`, `fee.create`, `fee.update`, `fee.delete` (void), `billing.read`, `billing.update`.
- ★ **Client managers and employees see nothing** of this for now. Showing a client its own fees and invoices is a later decision.
- An officer who lacks `billing.read` sees the Fees tab and not the Commercial tab, as in the prototype.

### Ownership and module boundaries

- A new **Billing** domain module owns three things: the fee ledger, the commercial terms and the invoice records. All three are staff-owned: the client and employee database roles get no access.
- **Billing reads GRO; GRO does not know Billing.** To record a fee against a step or a procedure, Billing checks through GRO's public API that it exists and has been filed. GRO publishes that a step was reopened; Billing subscribes and voids the fee (ADR-004).
- If recording a fee fails after a step was filed, the step stays filed and the person is told the fee was not recorded, so they can add it on the Fees tab. The fee is never silently lost and the filing is never rolled back.
- Reporting reads Billing for the fee figures.

### Money

- **Saudi riyals only.** Amounts are stored as whole halalas, so nothing is ever rounded in storage.
- Every fee, correction, void, change of terms and invoice record is audited. Billing changes are graded *notable*; a void and a removed invoice are *critical*.

### Out of scope

- Issuing tax invoices, e-invoicing, VAT calculation.
- Payments received, bank reconciliation, statements of account, credit notes.
- A client-facing view of fees or invoices.
- Multiple currencies.
- Automatic invoice runs or reminders.
- Recording a fee automatically without a person confirming the amount.

## Consequences

- Six "coming soon" placeholders can become real: the Fees tab, the Commercial tab, the step fee note, the Family tab's fee line, and the two Reports figures.
- The sequence filing dialog and the procedure completion dialog each gain an amount and an optional receipt.
- An Administrator must keep the invoice records in step with the accounting system by hand. If they do not, "not yet invoiced" overstates what is owed. The screens say where each figure comes from.
- The standard fees become a setting with twenty-odd values that someone must keep current.
- If the app is ever to issue invoices, that is a new ADR, and this ledger is what it would invoice from.

## Build

- **BILL-01:** the fee ledger's data and API, and the standard-fee setting.
- **BILL-02:** recording at the moment of filing (sequence steps and procedure completion), receipts, and voiding on reopen.
- **BILL-03:** the client's Fees tab.
- **BILL-04:** commercial terms and the estimate (Commercial tab, first half).
- **BILL-05:** invoice records: create, link fees, mark paid, derived standing.
- **BILL-06:** Reports fee figures, the Family tab's fee line, and seed data.

## Links

- ADR-004 (domain events)
- ADR-012 (prototype fidelity)
- ADR-013 (roles and the matrix)
- ADR-017 (dependant fees left to Billing)
- ADR-018 (step fees shown, recorded by Billing)
- ADR-019 (tier and term on the client's profile; money left to Billing)
- REP-06 (the headcount rule)
