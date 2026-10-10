# PROF-04 — The Records tab: contact, signatories, registrations, portals — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-019. Card approved in advance ("approved for all 6"). No API change.

## What changed

| Area | Change |
|---|---|
| `clients/[id]/profile-records.tsx` | New. The prototype's four cards, in a two-column grid: **Main contact** (name, Arabic name, role, email, phone), **Authorised signatories** (name · role, with the prototype's signature icon), **Registrations** (commercial registration, Qiwa establishment, GOSI establishment, VAT number), **Portals we hold credentials for** (outline badges). A missing value reads "Not recorded"; an empty card says so. |
| Editing | An Administrator (`client.update`) gets an **Edit** on each card. Each dialog saves only its own group and sends only what changed; an unchanged dialog sends nothing. Checks before sending: an email and a phone that look like one, each signatory row has both a name and a role (an empty row is dropped), CR is 10 digits, VAT is 15. Refusals from the server are shown in our own words. |
| Portals | The dialog is six checkboxes and nothing to type. The card carries the line "Names only. The app never stores a portal's username or password." The saved list is always in the fixed list's order. |
| `clients/[id]/records-tab.tsx` | The profile cards come first, as in the prototype; the company's documents follow. The "coming soon" block is gone. |

## Live (Administrator on Alpha Trading, then HR officer; dev servers restarted)

| Check | Result |
|---|---|
| Records tab before any data, 375px | Four cards: "No main contact recorded.", "None recorded yet.", the four registration fields ("Not recorded" except the CR), "None recorded." plus the names-only line. 0px overflow. |
| Main contact, email `hana.t` | "That email address doesn't look right."; **0 requests sent**; dialog 343px with no sideways scroll. |
| Main contact, valid | One PATCH whose body is only `{"contact":{…five fields…}}`. The card shows the name, Arabic name, role, email and phone. |
| Signatories, second row with a name and no role | "Give each signatory both a name and a role, or remove the row."; nothing sent. |
| Signatories, both rows complete | Body `{"signatories":[{"name":"Hana Bin Turki","role":"HR Director"},{"name":"Abdulaziz Al Faisal","role":"General Manager"}]}`. Card lists both. |
| Portals dialog | Qiwa, Muqeem, GOSI, Absher, Mudad, Balady; **0 text inputs**; each row 44px tall; each checkbox has its label. |
| Portals, GOSI ticked first and then Qiwa | Body `{"portals":["qiwa","gosi"]}` (list order, not click order). Card: Qiwa, GOSI. |
| Registrations, VAT of 14 digits | "A VAT number is 15 digits."; 0 requests. The message disappears as soon as the field is edited. |
| Registrations, valid VAT and a Qiwa number | Body `{"registrations":{"qiwaEstablishment":"1-1010000001","vatNumber":"310122441700003"}}`. The unchanged CR is not sent. |
| Arabic, 375px | All four cards translated (portals read «قوى», «التأمينات الاجتماعية»); nothing extends past a card; 0px overflow. |
| HR officer | Sees all four cards with their values; **0 Edit buttons**. |
| Audit | 4 `client` / `update` entries for Alpha from this session, one per saved dialog. |

**Carried over from PROF-03** (changed there after its live check): the Reports band slot is 124px wide and one line tall on every row ("Band not recorded" no longer wraps), the four bars still start at x 454 with equal widths, and the sub-heading reads "Saudi share of each register by nationality, beside the Nitaqat band recorded from Qiwa."

## Notes

- The Client record does not honour `?tab=` in its address (the Person record does). Not part of this card; worth a small follow-up if links to a client's Records tab are ever needed.
- Two of the registration checks were driven by setting the inputs from script rather than typing, to save time; the click and typing paths were exercised on the other three dialogs.

## Gates

- Web `typecheck` and `lint` clean; `next build` succeeds (dev server stopped).
- No API change: API suite stands at 750/750.

## Data

- The Administrator seed account's temporary authenticator enrolment was cleared (0 enrolled).
- Alpha Trading's contact, signatories, portals and registrations from this walkthrough remain on the dev database; PROF-05's seed sets every sample company's profile.
