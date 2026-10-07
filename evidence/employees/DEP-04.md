# DEP-04 — My file → My family — Evidence

- Date: 2026-10-07
- Status: **done**. Closes the dependants epic (DEP-00..04, ADR-017).
- Card approved by the owner. No API change: `GET /me/dependants` is DEP-02's.

## What changed

| File | Change |
|---|---|
| `me/family-section.tsx` (NEW) | **My family**, read-only, phone-first, in the Family tab's card shape. For each dependant: names, "Spouse · 33 years", the iqama number **in full** (grouped) or "Not yet issued", and three document rows (date · Hijri on one line under the label, days-left chip). Header: "2 dependants sponsored" (isolated in `<bdi>`, the DEP-03 Arabic-digit fix) or "No dependants on file". One action: **Something wrong? Request a change**. If the call fails, the section renders nothing rather than taking My file down. |
| `me/page.tsx` | The section sits between Identifiers/Pay and the requests strip. "Request a change" opens the existing raise dialog with a preset; the page's own Raise button clears the preset. |
| `me/raise-request-dialog.tsx` | Optional `preset: { type, title }`, read through a **ref**: a caller's inline object is new every render, and as a dependency it would re-run the "reset on open" effect while the person types. |
| `messages/en.json`, `ar.json` | `me.family.*` (title, none, requestChange, requestTitle). Labels reuse `person.family.*`. |

## Live (employee-a = Ahmed Hassan; dev servers restarted)

| Check | Result |
|---|---|
| `/en/me` at 375 | Sections in order: My documents, My identifiers, My pay, **My family**, My requests. "2 dependants sponsored". Yasmin Hassan (Spouse · 33, **2 400 000 101**) and Omar Hassan (Son · 6, **2 400 000 102**). Both iqamas **45d left** (21 Nov 2026 · Jumada II 11, 1448 AH); passports 900d / 400d; insurance 120d. No Renew, no Edit, no Remove. 0px page overflow, 0px inside the section. |
| **Request a change** | Opens "Raise a request" with type **General** and title **Family details**. Typing a description keeps it (no reset while typing). Submit sends `POST /me/requests {"type":"general","title":"Family details","description":"…"}`; the notice reads "Request sent: Family details". |
| The page's own **Raise** afterwards | Opens **blank** (Letter, empty title), so the preset doesn't leak. |
| Staff see it | HR officer `GET /requests`: *Family details*, `general`, `open`, requester `{kind: employee, name: Ahmed Hassan}`, client A, due **2026-10-08** (General's 1-working-day service level, THREAD-04). |
| Colleague check, on screen | My file shows nothing of **Sadia Ali** (Syed Ali's wife, **the same company**) or of Rajesh Kumar's family. The DEP-02 API test and isolation harness prove the fence; this is the screen agreeing. |
| `/ar/me` at 375 | «عائلتي», «مُعالان على الكفالة», «معلومة غير صحيحة؟ اطلب تعديلًا», «زوج/زوجة · 33 سنة», «باقٍ 45 يومًا». 0px overflow. |

## Gates

- Web `typecheck` and `lint` are clean.
- **`next build` succeeds** (run with the dev server stopped); `/[locale]/me` is 4.71 kB.
- No API change, so the API suite is unchanged (701/701 at DEP-03).

## Data

The verification request "Family details" (Ahmed Hassan, open) stays in the local database as ordinary sample data. The next seed run resets the seeded requests and leaves this one alone, like any request raised by hand.
