# BILL-00 — Billing into the architecture (ADR-020, architecture.md v1.14) — Evidence

- Date: 2026-10-10
- Status: **done**. Documentation only: no code, nothing deployed.

## Owner decisions (asked; answers recorded)

| Question | Answer |
|---|---|
| Which epic next? | **"let's do billing next"** |
| What should the app do about invoices? | **Record them, issue elsewhere** (recommended). |
| How is a government fee recorded when a step is filed or a procedure resolved? | **Staff confirm the amount paid** (recommended). |
| Who sees and does what with the money? | **Staff ledger, Administrator terms** (recommended). |
| Where do the standard fee amounts live? | **A setting the Administrator edits** (recommended). |
| The BILL-00 card, the four follow-on rules and the six build cards | **"approved for all"** |

The four follow-on rules, put to the owner before approval: an invoiced fee is never removed; the app calculates no VAT and the next-invoice figure is an estimate; overdue is derived; the dependant fee stays information.

## What the research found first

- **Prototype** (`design/…/People & Gro Console.dc.html`):
  - `PROC_FEES` maps ten procedure titles to an amount and an authority (for example "Iqama renewal" 9,700 Muqeem). `recordFee` writes a fee with a `GF-` reference and status `Recorded` when a work item is resolved, when a renewal is saved, and when a runbook step is completed (with an optional receipt). Reopening a step removes its fee.
  - `SEED_FEES` marks fees older than 26 days `Invoiced`. Nothing links a fee to an invoice.
  - The Fees tab shows four tiles over 90 days, a breakdown by authority, and the 14 most recent ledger rows.
  - The Commercial tab is administrator-only (`crIsCommercial: tab === 'commercial' && isAdmin`); the Fees tab is not gated.
  - **The invoice list is fabricated**: four rows built from `platform + staff × seat`, the newest "Sent" or "Overdue", the rest "Paid".
  - `DEP_FEE = 4800` a year per dependant, shown on the Family tab.
- **Architecture before this card:** "15. Billing (future)"; the reference-systems table says ZATCA (Fatoora) e-invoicing fields "activate with Billing"; an earlier owner decision put Billing in scope as a later epic.
- **App today:** no fee, term or invoice is stored. Six places say "coming soon".

## What was written

| File | Change |
|---|---|
| `adr/ADR-020-billing.md` | New. Context, options, the decision (scope, ledger, standard fees, terms, invoice records, who, module boundaries, money, out of scope), consequences, build cards. |
| `adr/README.md` | ADR-020 in the index. |
| `architecture.md` | **v1.14**: changelog; module 15 leaves "future"; two catalog rows (`fee`, `billing`) and two matrix rows; the ZATCA line now says it activates only if the app ever issues invoices. |
| `BACKLOG.md` | BILL-00 done; BILL-01..06 listed as approved. |
| `CLAUDE.md` | Map row (v1.14, ADR-020) and a current-state paragraph. |

## Choices of mine inside the decision (stated in the ADR, open to change)

- **Officers may void a fee**, not only the Administrator. Reopening a step voids its fee, and officers reopen steps.
- **Amounts are stored as whole halalas.**
- **A removed invoice record is soft**, and allowed only while it is unpaid and recovers no fee.
- **Billing reads GRO; GRO never imports Billing.** A fee is recorded by a second request after the step is filed; if that fails the person is told, and the filing is not rolled back.
- **The tier and term dates stay on the client's profile** (ADR-019) and are shown on the Commercial tab beside the terms.

## Not verified, and said so in the ADR

- ZATCA's current e-invoicing requirements.
- How VAT applies to government fees passed through at cost.
- The prototype's fee amounts.
