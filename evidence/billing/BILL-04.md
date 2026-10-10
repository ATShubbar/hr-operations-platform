# BILL-04 — Commercial terms and the next-invoice estimate — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-020. Card approved in advance ("approved for all").

## What changed

**Data.** `bil_terms`: one row per client. A platform fee and a rate per employee (both per month, whole halalas), the billing cycle (monthly, quarterly, annual), a purchase-order number and the payment terms in days. Staff-owned: `app_staff` may read, insert and update (no delete); `app_client` and `app_employee` have no grant. CHECKs: amounts 0 to SAR 1,000,000, payment terms 0 to 365 days, a purchase order is not blank. Migration `20261013120000_billing_terms`.

**Permissions.** `billing.read` and `billing.update`. Administrator holds both; the Auditor reads; HR and GRO officers hold neither. Matrix row "Commercial terms & invoice records" pinned in `role-matrix.e2e-spec.ts`.

**API** (`modules/billing`, staff only, checked by `scopeOf` as well as the permission):

| Route | Permission | What it does |
|---|---|---|
| `GET /billing/clients/:clientId` | `billing.read` | The terms (or `null`), the estimate (or `null`), the fees not yet recovered, who last changed the terms and when |
| `PUT /billing/clients/:clientId/terms` | `billing.update` | Replaces the whole set. Strict body. Audited as `billing-terms` `create` the first time and `update` after, with before and after. Graded notable. |

**The estimate is never stored.** It is worked out when asked: the people under management at the client (the shared headcount rule, `isUnderManagement`) times the rate, plus the platform fee, times the cycle's months, plus every fee still `recorded`. The arithmetic is `estimateSubscription` in `@hr/contracts/billing-lists`, with its own unit test.

**Screen.** `clients/[id]/commercial-tab.tsx`, mounted as the Client record's **Commercial** tab (it said "coming soon"; every tab on the record is now built):

| Part | What it shows |
|---|---|
| Subscription | Tier (from the profile), platform fee, "N employees at X each", **Monthly**, the cycle amount, annual contract value, government fees not yet recovered, **On the next invoice (estimate)**. A note says it is an estimate, the invoice is issued from the accounting system, and no VAT is calculated. |
| Agreement | Term start and end (with Hijri) and days to renewal, from the client's profile; purchase order; payment terms; who last changed the terms. Account standing says "Soon" (BILL-05). |
| What the tier includes | The prototype's list for the recorded tier, with a note that nothing in the console is switched by the tier. |
| Invoices | "Soon" (BILL-05). |
| Edit terms (Administrator) | Platform fee, rate per employee, cycle, payment terms, purchase order. Refuses a blank amount (0 must be typed), a third decimal place, and days outside 0 to 365. |

A viewer without `billing.read` (HR and GRO officers) gets the prototype's locked state, and the page makes no request for the figures.

## Tests

`apps/api/test/billing-terms.e2e-spec.ts` (8) and `packages/contracts/src/billing-lists.test.ts` (4). The API spec was written before the table and the service existed, so it could not run red first. Each rule was instead proven by breaking it:

| # | Broken | Result |
|---|---|---|
| 1 | Staff check removed from the controller | the widened-policy test fails (a client manager granted `billing.*` reads and writes their own terms) |
| 2 | Headcount = everyone on the list | 3 tests fail (5 counted instead of 3) |
| 3 | Archived company treated as active | the archived-company test fails |
| 4 | Unrecovered = every fee | the next-invoice test fails (void and invoiced fees counted) |
| 5 | Next invoice leaves the fees out | the next-invoice test fails |
| 6 | No audit entry | the audit test fails |
| 7 | Auditor loses `billing.read` | the read test and the role matrix fail |
| 8 | HR officer gains `billing.read` | the "who" test and the role matrix fail |
| 9 | `app_client` granted SELECT on `bil_terms` | the database test fails |
| 10 | Amounts CHECK dropped | the database test fails |
| 11 | Payment-days CHECK dropped | the database test fails |
| 12 | Terms body not strict | the 400 test fails (`vatRate` and `tier` accepted) |

All twelve failed as expected. Each file was restored and compared byte for byte; the grants and constraints were re-read from the database after.

- API suite: **780/780** (772 + 8).
- Contracts: 22/22. Lint and typecheck: clean. `next build`: passes.

## Live (local, seed company Alpha; rows removed afterwards)

| Check | Result |
|---|---|
| No terms yet (Administrator) | "No commercial terms are recorded for this client yet", the fees not yet recovered, and a **Record terms** button. No estimate and no estimate note. |
| Dialog validation | Empty amounts: "Enter both amounts. Use 0 if there is no charge." A rate of 65.555: "Enter an amount in riyals, with at most two decimal places." |
| Save: 3,500 platform, 65 per employee, quarterly, PO-2026-0412, 30 days | 11 employees (SQL: 11 not terminated, not onboarding) × 65 = SAR 715; monthly SAR 4,215; quarterly SAR 12,645; annual SAR 50,580. All match by hand. "Terms last changed by Faisal Al-Otaibi on 10 Oct 2026". |
| A fee of SAR 9,700.50 recorded on the client | Not yet recovered SAR 9,700.50 (amber); next invoice SAR 22,345.50 = 12,645 + 9,700.50. |
| Auditor | Sees every figure; **0 buttons**. `PUT` as the Auditor: 403. |
| HR officer | The locked state; **0 requests** to `/api/billing`. `GET` as the HR officer: 403. |
| Arabic | Every line translated, no missing keys. First render had dates and day counts scrambled ("10 2024 أكتوبر") and full stops at the start of sentences, because the layout is left to right (ADR-012); each whole line and value is now isolated. Re-checked: "10 أكتوبر 2024", "141 يومًا حتى التجديد". |
| 375px | 0px page overflow; nothing wider than its card. The Subscription sentence wrapped into a narrow column beside the tier and the button, so it now sits on its own line under the title. |

Temporary authenticator enrolments for the Administrator and the Auditor seed accounts were cleared afterwards (0 enrolled). The fee and the terms row were deleted; the seed was re-run after the suite.

## Stated plainly

- **The tier list is the prototype's wording, not a verified description of the service.** It names things the console does not do (payroll and WPS file preparation, forecasting the Nitaqat band). It is shown to the Administrator and the Auditor only, with a note that the tier switches nothing on. The owner should correct the wording if it does not match what is sold.
- **The estimate uses today's headcount.** It does not prorate for people who joined or left during the cycle, and it does not know what was already invoiced for the cycle. It is labelled an estimate.
- **Terms are replaced, not versioned.** The history is the audit trail (before and after on every change).
- **Account standing and the invoice list are not built.** Both say "Soon" and come with BILL-05.

## Found, not fixed

- The Audit trail's "Records" category filter lists a fixed set of record types and has not been extended as new ones were added (dependant, sequence, leave, fee, and now billing terms). Filtering by Records leaves those entries out; they still appear unfiltered. Filed as AUDIT-08.
