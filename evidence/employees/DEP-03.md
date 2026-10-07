# DEP-03 — The Person record's Family tab — Evidence

- Date: 2026-10-07
- Status: **done**
- Decision: ADR-017. Card approved by the owner.

## What changed

| File | Change |
|---|---|
| `employees/[id]/family-tab.tsx` (NEW) | The prototype's tab. A header card ("N dependants sponsored · annual dependant fees coming soon", or the prototype's empty sentence) with **Add a dependant**. One card per dependant: avatar, English name with Arabic beneath, "Spouse · 37 years", the iqama number grouped `2 400 000 301` / "Not yet issued" / **masked** `••• ••• •••`. Three document rows (Dependant iqama / passport / insurance): Gregorian + Hijri date, the People screen's days-left chip, **Renew** inside 90 days. A ⋯ menu with **Edit / Remove**. Loading skeleton, `LoadError` with retry, `NoAccess` on 403. All changes need `govdata.update` and are hidden for a terminated sponsor. |
| `employees/[id]/dependant-dialog.tsx` (NEW) | Add/Edit. Fields: relationship (Select with translated value), English name, Arabic name (`dir=rtl`), date of birth, iqama number (`dir=ltr`, mono), three expiry dates. The iqama number and name are checked in the browser first (nothing is sent when invalid). **Edit sends only changed fields.** A masked number starts empty and is never sent unless retyped, so saving other details can't clear a hidden number. Server refusals map to translations (400 / 409 / other). The form resets by tracking `open` during render (DS-09 landmine). |
| `employees/[id]/page.tsx` | Family is a real tab; only Mobilisation stays "coming soon". |
| `employees/[id]/history-tab.tsx` | A dependant entry reads "Dependant added · Karan Kumar". |
| `messages/en.json`, `ar.json` | `person.family.*` (incl. Arabic plural forms) and `person.history.action.dependant.*`. `person.soon.family` removed. |

## The API addition this card needed (surfaced, not slipped in)

ADR-017 and DEP-01 said dependant changes "appear on the Person record's History". **They did not.** `GET /employees/:id/history` asked the audit trail for four named resources only. Fixed:

| File | Change |
|---|---|
| `packages/contracts/src/employee-history.ts` | `historyResourceSchema` gains `dependant`; `subject` gains `{ kind: 'dependant', name, relationship }`. |
| `audit/application/audit-query.service.ts` | `forRecords` rows carry `subjectId`: the `dependantId` read from the snapshot inside the service. **The snapshot never leaves it**; history stays curated. |
| `employees/application/dependants.service.ts` | `allFor(employeeId)`, removed dependants included, so History still names a removed one. |
| `history/api/employee-history.controller.ts` | Asks for `dependant` entries keyed to the person and names each from `allFor`. |

The test is in `dependants-api.e2e-spec.ts`. Add, edit and remove appear on the sponsor's History as `create/update/remove`, each naming the dependant, including after removal. The iqama number is absent from the response, and none of it appears on a colleague's History.
- It failed before the change (red), and passed after.
- **Red proof:** dropping the `dependant` source fails it again; the file was restored byte-identical (`cmp`).

## Tests and gates

- `dependants-api.e2e-spec.ts` **11/11**; **full API suite 701/701**.
- contracts build; web `typecheck` + `lint` clean (incl. `no-bare-select-value`).
- **`next build` succeeds**, run with the dev server stopped (`/[locale]/employees/[id]` 18.3 kB). The page imports only TYPES from `@hr/contracts`, so no zod is shipped.

## Live (seed data, dev servers restarted)

| Check | Result |
|---|---|
| GRO officer, Rajesh Kumar, `/en/…?tab=family`, 1280 | "3 dependants sponsored · annual dependant fees coming soon". Anitha (Spouse · 37, `2 400 000 301`): iqama + insurance **6d over** in red with Renew; passport 640d left. Maryam (Daughter · 11). Faris (Son · 2, **Not yet issued**, iqama/insurance "Not on file"). |
| **Renew** Anitha's iqama | The dialog proposes today + 12 months (2027-10-07, Hijri echoed). Save sends `PATCH {"iqamaExpiry":"2027-10-07"}`, **one field**. The row now reads 365d left and its Renew is gone. |
| **Add** a son | An iqama of `1234` shows "An iqama number is 10 digits starting with 2." with **0 requests**. Fixed to `2400000399`, it sends a POST carrying only the filled fields. Listed in order wife → Maryam (11) → Karan (6) → Faris (2); the summary goes to 4. |
| **Edit** (⋯ → Edit) | Prefilled (Son, DOB, iqama number). Changing the passport expiry gives an audit entry with `changed: ["passportExpiry"]`, no values. |
| **Remove** (⋯ → Remove) | Confirm reads "They leave this list. The record is kept, and the change stays in this person's history." Sends `POST …/remove`; gone from the list; the summary is back to 3. |
| **History** tab | "Dependant removed · DEP-03 Karan Kumar", "Dependant updated · DEP-03 Karan Kumar", "Dependant added · DEP-03 Karan Kumar", "Dependant updated · Anitha Kumar". |
| Audit rows (SQL) | 4 entries against Rajesh, all `gro_officer`: Renew `changed: ["iqamaExpiry"]`, Edit `changed: ["passportExpiry"]`; no number or date in any snapshot. |
| **Auditor** (temporary TOTP, cleared after: 0 seed accounts enrolled) | Ahmed Hassan's family is readable; **0 buttons** in the panel (no Add, no ⋯, no Renew even at 45 days). |
| **Masked number** | No v1.7 role lacks `govdata.read`, so the API response was rewritten in the browser to `identifierVisible: false, iqamaNumber: null` and the tab remounted. Both rows show `••• ••• •••` with a screen-reader "Iqama number hidden". The first version used `aria-label` on a plain span, which many screen readers ignore; it was changed to `aria-hidden` dots + `sr-only` text and re-verified. |
| Desktop columns | `466.66px 333.33px 96px 88px` (the prototype's 1.4fr : 1fr : 96 : 88), rows 44px, 0px overflow. |
| `/ar/…` at 375 | Arabic throughout: «المُعالون», «زوج/زوجة · 37 سنة», «إقامة المُعال», «متأخر 6 أيام», «تجديد». **0px page overflow, 0px inside every card**, every Renew on screen (right edge 343 of 375). |

## Two defects caught while verifying, both fixed

1. **Renew was off-screen on a phone.** With the prototype's four-column grid in a scroll region, the action column sat **97px** beyond the card at 375px. Below `sm` the date now moves under the document name and the grid is three columns. From `sm` the prototype's grid is unchanged (measured above).
2. **The Arabic summary put its number at the wrong end.** «3 مُعالين على الكفالة…» rendered with the "3" at the far end of the LTR line (ADR-012 lays Arabic out LTR). The sentence is now in a `<bdi>` inside a span (THREAD-02's recorded pattern). Measured: the digit sits immediately right of the first Arabic word (x 215 vs 211), so it reads first.
   - **Not fixed here:** other Arabic sentences in the app that open with a digit likely do the same. That would be a sweep, not this card.

## Data

Re-seeded after the walk-through, so Anitha's iqama is back to 6 days over. The removed "DEP-03 Karan Kumar" row stays **soft-removed** in the local database. That is what the product does, and the seed only upserts its own rows; History keeps naming him.
