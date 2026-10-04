# LEAVE-04 — The Leaves screen — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → LEAVE-04 (ADR-014; ADR-012 prototype fidelity). Status: **done**. No API change.
- Owner decision: the start date is a **date picker** with the Hijri date echoed underneath, not the prototype's 16-week list.

## What was built

| File | What |
|---|---|
| `(app)/leaves/page.tsx` | Replaces the "coming soon" page. Contents are listed below. |
| `(app)/leaves/request-leave-dialog.tsx` | Fields: type (with the basis hint), who it's for (people from `/leave/balances`, which client managers can read even with the portal off), days, start date (date picker + Hijri), details. The live note covers the cap, recorded-not-deducted, and balance short or fits. **Server refusals are mapped to translations** (cap, Hajj once, leaver, generic), never raw API text. Resets on every open (the DS-09 landmine). |
| `lib/leave.ts` | Type order, the advisory caps, `deductsBalance`, UTC date helpers, `overlaps`, Riyadh "today" |
| `lib/status-tone.ts` | New `leave` domain: pending → warning, approved → info, filed → ok, declined → critical, withdrawn → neutral |
| `components/app-nav.tsx` | Staff Leaves entry now gated on `leave.read`. **Client managers get Leaves** after Overview, as the prototype gives them. |
| `messages/{en,ar}.json` | A `leaves` namespace in both languages, including ICU plurals (يوم واحد / يومان / ٣ أيام) |

**The page:**

- **Header and summary:** "N awaiting the employer, M awaiting filing by People & Gro", plus **Request leave** for `leave.create` holders.
- **The tile strip:** one card, four cells (the prototype's `lvStats`), 2×2 on phones.
- **Tabs:**
  - **Requests:** a type filter, and a list (320px) beside a detail pane.
  - **Balances:** a "next release" note (LEAVE-05).
- **Detail pane:**
  - type, reference, employee · company, status;
  - length + pay, dates in Gregorian **and Hijri**, submitted (service level "Soon": no SLA is stored);
  - the details, a wait line per role and state, the basis line;
  - the **annual balance block** ("X of Y available", "N left if this is filed", a shortfall note);
  - the **clash list** (overlapping leave at the same company);
  - per-role buttons.

## Verified live (local dev, seeded accounts, real flow)

I created five requests through the API: one approved and filed (someone away today), one approved, two pending, one declined. Then I checked each role:

| Role | Saw / did |
|---|---|
| **HR officer** | **Request leave** shown. On a pending request: the wait line "With Alpha Trading Co. for a decision. Only they can approve it.", **Withdraw** (HR raised it), **no Approve**. Ahmed Hassan's request showed "18 of 18 days available · 14 days left if this is filed" and **"1 colleague at Alpha Trading Co. is away over the same dates — Ibrahim Diab · Annual leave · 12 Oct — 14 Oct"**. **Filed through the UI:** the button showed → toast "LV-0396 filed against the record." → status Filed → "0 awaiting filing". |
| **Client manager** (Alpha) | Nav: Overview · **Leaves** · My company · My employees · My documents. Only their company's 5 rows. On a pending request: **Approve / Decline**, no File, no Withdraw (HR raised it), no on-behalf note, "Your decision. People & Gro files it once you approve." **Approved through the UI** → "Awaiting filing", "Approved. People & Gro is filing it now." **The dialog through the UI with real clicks:** paternity, 5 days → the note "5 days requested against a statutory maximum of 3" → Submit → **the server's refusal shown translated:** "That's more than this type of leave allows in one request." → 3 days → "Recorded against the statutory entitlement…" → Submit → toast "LV-0398 submitted…", the new row selected, counts updated. |
| **GRO officer** | Leaves in the nav; **no Request leave**; **File the leave** on the approved request; **nothing** on the pending one. |
| Administrator / Auditor | Not driven in the browser: both need an authenticator locally. Their rules (approve on behalf; read-only) are pinned by the LEAVE-02 API tests. The UI's on-behalf note shows for staff holding `leave.approve`. |

- **Arabic at 375px:** 0px horizontal overflow; no missing keys; plurals correct.
- **Server message ↔ mapping:** checked directly (`"paternity leave is capped at 3 days per request (Art. 113)"` → `errCap`; a malformed body → the generic message).

### Defects found while verifying, and fixed

1. At 375px the 200px type filter squeezed the tabs until **"Balances" was cut off**. The filter now stacks under the tabs below `sm`.
2. "Away today" used the prototype's first-word split, which turned «عبد الله القحطاني» into **«عبد»**. It now shows full names and lets the line truncate.

### Also cleaned

Two **leftover isolation-harness companies** in the local database ("ISO-employee Co.", 2 employees and 2 leave rows each), left by harness runs that had failed mid-LEAVE-02 before its cleanup fix. They had been showing up in the list. I deleted exactly those, in one transaction.

### A harness note, not an app defect

Under the pane's phone emulation, real clicks on buttons that open a dialog don't open it. That includes the existing **Raise a request** on Overview, so it isn't specific to this screen. A scripted click opens the Request leave dialog at the same size. Real clicks work at desktop size, where the dialog flow above was driven.

Web typecheck + lint clean.
