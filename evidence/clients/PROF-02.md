# PROF-02 — Add / Edit client, the Clients cards and the record header — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-019. Card approved in advance ("approved for all 6"). No API change.

## What changed

| Area | Change |
|---|---|
| `clients/client-form-dialog.tsx` | The prototype's form: registered name, name in Arabic, commercial registration (helper "Ten digits, as issued by the Ministry of Commerce"), city, sector, Nitaqat band, and, when adding, main contact and contact email. Choosing a band reveals **Band checked on** (defaults to today, cannot be later). Only the names are required. An edit sends **only what changed**; nothing changed sends nothing. Server refusals are mapped to our own words: 409 "Another client already has this commercial registration", 400 "Some details aren't valid". |
| `components/client-profile-bits.tsx` | New. `BandPill` (the stored band as a status pill; no band reads "Band not recorded", never a colour) and `ProfileLine` ("Construction · Dammam · CR 1010224417", only the parts on file, as one isolated text run). |
| `clients/page.tsx` (cards) | The band sits in the badge slot, as in the prototype; an archived company shows "Archived" there instead. The profile line replaces "Sector · city · CR — coming soon". |
| `clients/saudi-share.tsx` | The bar takes its colour from the **stored band** (red band → red, yellow → amber, otherwise ink), as the prototype paints it. It is still never coloured by a threshold on the percentage. |
| `clients/[id]/page.tsx` (header) | The band beside the name; an archived company also shows "Archived"; the profile line under the Arabic name. |
| `lib/status-tone.ts` | A `nitaqat` domain: red critical, yellow warning, greens ok, platinum info (the prototype's tones). |
| Messages | New `clientProfile` namespace (cities, sectors, bands, portals, tiers, commitments, in English and Arabic) and `clients.form.*`. Removed the two "coming soon" strings and an unused status label. |

**Deviations from the prototype, on purpose:**
- The prototype requires the CR number. Here only the names are required, because the API makes every profile field optional (ADR-019: existing clients predate them). A CR number that is entered must be ten digits.
- "Band checked on" is ours (ADR-019).
- The prototype's staff-register CSV import is still "coming soon".

## Live (Administrator, then HR officer; dev servers restarted)

| Check | Result |
|---|---|
| Cards before any profile | Each reads "Band not recorded" and "Sector, city and commercial registration not recorded"; the archived company reads "Archived". 0px overflow at 375px. |
| Add a client dialog at 375px | 343px wide, no sideways scroll. Labels: Registered name, Name in Arabic, Commercial registration, City, Sector, Nitaqat band, Main contact, Contact email. No "checked on" field until a band is chosen. |
| Nine-digit CR, submit | "A commercial registration is 10 digits."; the dialog stays open; no client created (count unchanged). |
| Valid form (Dammam, Construction, Yellow, a contact) | Created; the app opens the new record. Header: "Arabian Shield Contracting · Yellow · Construction · Dammam · CR 1010224417". The API row holds the CR, city, sector, `{band: yellow, checkedOn: 2026-10-10}` and the contact's name and email. |
| Edit → band Red → Save | The request body is exactly `{"nitaqat":{"band":"red","checkedOn":"2026-10-10"}}`. Header pill reads Red. |
| The card | "Red" pill in `rgb(220, 38, 38)`; the share bar is `bg-status-critical`, the same red. |
| A CR already used, in the Arabic edit dialog | «هذا السجل التجاري مسجّل لعميل آخر.», inside the dialog; the other client's CR is still empty. |
| Arabic cards at 375px | «المقاولات · الدمام · س.ت 1010224417». Measured positions: sector at x 179–222, city 141–169, number 34–100, so it reads sector, city, CR from the right. 0px overflow. |
| HR officer | Sees the band and line on the card and the header. No "Add a client" button; the header has only View register and Start a procedure (no menu, so no Edit). |

## One thing I could not explain

On the first HR-officer visit to the client record, the tab ended up on the Overview a few seconds after the record's data had loaded (every request in the log was 200). The only code that navigates to the Overview is the sign-in page, which means something sent the tab to sign-in first. It did not happen again in two further visits, one at the same 375px size. I have no cause for it and no evidence it is related to this card; I am recording it rather than leaving it out.

## Gates

- Web `typecheck` and `lint` clean.
- `next build` succeeds (dev server stopped). One line changed after that build (the form clears its error message when a field is edited); `typecheck` and `lint` were re-run, and the next card rebuilds.
- No API change, so the API suite stands at 750/750 from PROF-01.

## Data

The walkthrough client and its two audit rows were deleted on the owner connection (5 clients, none with a CR). The Administrator seed account's temporary authenticator enrolment was cleared (0 enrolled).
