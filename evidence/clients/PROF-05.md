# PROF-05 — The Service panel, the client manager's company page, and seed profiles — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-019. Card approved in advance ("approved for all 6"). No API change.

## What changed

| Area | Change |
|---|---|
| `clients/service-panel.tsx` | New. The prototype's Service panel: the named officer (avatar, name, "role · named officer"), tier, response commitment, term end (Gregorian and Hijri). A fixed line under it: "Recorded for reference. Request due dates follow the service levels set for each request type." |
| Editing | An Administrator gets **Edit** on the panel: officer, tier, response commitment, term start and end. The officer list comes from the staff directory, limited to the roles government work can be handed to (the server refuses anyone else). Only changed fields are sent; a term that ends before it starts is refused before sending. |
| Client record → Overview | The panel replaces the "Soon" placeholders. |
| `portal/company/page.tsx` (the client manager's **My company**) | Their own company's whole profile, read-only: name, band and what it means, sector · city · CR, the Service panel, and the four Records cards. No Edit anywhere (they hold no `client.update`). A closing line says to raise a request to change anything. This is where the owner's "client managers see all of it" decision lands; it follows the portal switch as before. |
| Seed | `seedClientProfiles`: a profile for each of the five sample companies. Bands: Alpha medium green, **Beta red**, **Najd yellow**, Gulf Medical platinum, Al Waha (archived) none. Beta and Najd have open roles with non-Saudi candidates, which the next card's warnings need. Al Waha has only a registration, city and sector, so "not recorded" stays reviewable. The function sets every profile column on every run, nulls included, and runs after the users (the officer is a staff account). All values are invented; the registration numbers are sequences. |

## Live (dev servers restarted; data re-seeded)

| Check | Result |
|---|---|
| Beta, Service panel, Administrator, 375px | "Turki Al-Harbi · GRO officer · named officer · Tier Enterprise · Response commitment Same working day · Term ends 27 Nov 2026 · Jumada II 17, 1448 AH", plus the reference line. Panel 343px, 0px overflow. |
| Edit dialog | Officer, Tier, Response commitment, Term starts, Term ends, each prefilled. 343px, no sideways scroll. |
| Officer list | "Not recorded" and six people: two Administrators, three HR officers, one GRO officer. **The Auditor is not offered.** |
| Choose another officer, Save | The request body is `{"service":{"officerUserId":…}}` and nothing else. The panel shows the new officer. |
| Al Waha (archived), Arabic | Header shows both «النطاق غير مسجّل» and «مؤرشف»; every Service field «غير مسجّل». 0px overflow. |
| Client manager of Alpha, **My company**, 375px (portal switched on for the check) | Header "Alpha Trading Co. · Medium green · Wholesale & retail · Riyadh · CR 1010000001" with the band's note; Service panel; Main contact, Authorised signatories, Registrations, Portals. **0 buttons** on the page. **No request to `/staff-users` or `/clients`**: everything comes from the portal's company view. 0px overflow. |
| The same page in Arabic | Translated throughout; nothing extends past a card; 0px overflow. |

## Seed

Seeded twice in a row with the same result. After the full API suite, seeded again:

| Company | Band | Officer | Tier | Term ends |
|---|---|---|---|---|
| Alpha Trading Co. | medium_green | Turki Al-Harbi | professional | +141 days |
| Beta Contracting Est. | red | Turki Al-Harbi | enterprise | +48 days |
| Najd Logistics Co. | yellow | Omar Al-Shehri | professional | +310 days |
| Gulf Medical Group | platinum | Turki Al-Harbi | essential | +22 days |
| Al Waha Trading Est. | none | none | none | none |

The re-seed also undid the walkthrough's change of Beta's officer, which is the reset the function is written for.

## Decided here, and why

**The seed does not switch the client portal on for the sample company.** It would let the sample client manager see My company without a visit to Settings, but an existing test (`configuration-flags`) uses that company and expects the switch to start at the system default. So on UAT the profile appears for the client manager once an Administrator turns on "client self-service" for the company in Settings → System, as today.

## Gates

- Full API suite **750/750** against the seeded profiles (one run; the API code did not change in this card).
- API `typecheck` and `lint` clean. Web `typecheck` and `lint` clean; `next build` succeeds (dev server stopped).

## Data

- The Administrator seed account's temporary authenticator enrolment was cleared (0 enrolled).
- The portal switch for Alpha was removed again; the only client setting left is the seed's own.
