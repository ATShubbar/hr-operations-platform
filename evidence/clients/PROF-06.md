# PROF-06 — The band warnings — Evidence

- Date: 2026-10-10
- Status: **done** — the last card of the client profile + Nitaqat epic (PROF-00..06, ADR-019).
- Card approved in advance ("approved for all 6"). The owner chose "warn at the moment"; the precise rule was put to them before approval.

## The rule, in one place

`packages/contracts/src/client-profile.ts` → `bandWarning(band, check)` returns `'red'`, `'yellow'` or `null`:

| Band | A non-Saudi hire | Work-permit renewal | Sponsorship transfer | Any other procedure |
|---|---|---|---|---|
| Red | warn | warn | warn | no |
| Yellow | warn | no | no | no |
| Greens, Platinum | no | no | no | no |
| No band on file | no | no | no | no |

A Saudi hire never warns. Nothing is blocked anywhere: the function only decides whether a line of text is shown. The server was not changed.

## What changed

| Area | Change |
|---|---|
| Contracts | `bandWarning`, `RED_BAND_PROCEDURES`, `BandCheck`, in the zod-free `client-profile` subpath. |
| `components/band-warning.tsx` | New. An amber note (the app's existing warning banner) with three lines: "{company}'s Nitaqat band is {band}", what that band means for this action, and "Recorded from Qiwa, last checked {date}. The band may have changed since. You can still go ahead." Renders nothing when the rule says nothing. |
| Hiring | The note appears in the confirmation both employee-creating moves already show (To visa & mobilisation, Onboard directly). It is the same dialog whether the move comes from a card button, the candidate dialog or a drag. |
| Start a procedure | The dialog takes the employer's band from whoever opens it (Person record, Client record, Overview) and shows the note for the two procedure types a Red band bears on. On a Client record it shows before a person is picked, since the employer is already known. |
| `ui/dialog.tsx` | Dialog titles keep 32px clear at their end. Found here: a title whose first line reached the edge ran underneath the close button ("…for Imran Khan?" lost its last letters). It applies to every dialog. |

## Tests

`packages/contracts/src/client-profile.test.ts`, 7 tests, written first; first run failed on every one (`bandWarning is not a function`). They assert the whole table above, including that exactly two procedure types warn on Red and that no band never warns, plus the ladder's order.

**Red proofs** (the rule changed, a test fails, the file restored and compared byte for byte):

| Changed to | Failed |
|---|---|
| Yellow also warns on procedures | "on yellow, no procedure warns" |
| Saudi hires warn too | "a Saudi hire never warns" |
| Every procedure warns on Red | "on red, exactly the work-permit renewal and the sponsorship transfer warn" |
| Yellow hires do not warn | "a non-Saudi hire warns on red and on yellow" |

**Gates:** contracts **18/18**. Full API suite **750/750, twice**. API and web `typecheck` and `lint` clean. `next build` succeeds (dev server stopped).

## Live (HR officer; seeded bands: Beta red, Najd yellow, Gulf Medical platinum)

Four sample candidates were first moved to Offer through the API.

| Check | Result |
|---|---|
| Rajesh Kumar (Indian), Beta (red) → To visa & mobilisation | "Beta Contracting Est.'s Nitaqat band is Red · While the band is red, work permits are blocked and every hire must be Saudi. This candidate is not a Saudi national. · Recorded from Qiwa, last checked 28 Sept 2026. The band may have changed since. You can still go ahead." Inside the 343px dialog, no sideways scroll. **Start mobilisation is enabled.** |
| The same candidate → Onboard directly | The same note. Onboard enabled. |
| Mazen Alotaibi (Saudi), Beta (red) → Onboard | **No note.** |
| Imran Khan (Pakistani), Najd (yellow) | "…band is Yellow · While the band is yellow, new work permits are restricted. This candidate is not a Saudi national." |
| Gracia Reyes (Filipino), Gulf Medical (platinum) | **No note.** |
| Opening and cancelling all five | 0 requests sent. |
| Go ahead with Imran Khan under the Yellow note | One request, `{"stage":"mobilisation"}`; the candidate is in Visa & mobilisation with an employee record. Not blocked. |
| Start a procedure, Rajesh Kumar's record (Beta, red) | Iqama renewal: no note. Work permit renewal: "…work permits and transfers are blocked. Qiwa may refuse this procedure." Sponsorship transfer: the same note. Back to Iqama renewal: the note goes. |
| Submit the work-permit renewal | Created (`not_started`); Beta's procedures went 7 → 8. Not blocked. |
| Shah Mohammed's record (Najd, yellow) | Work permit renewal and Sponsorship transfer: no note. |
| Beta's Client record, Arabic, 375px, chosen by real clicks | The note appears as soon as «تجديد رخصة عمل» is chosen, before any employee is picked; it is still there 4 seconds later; inside the 343px dialog; 0px overflow. |
| Dialog title | "Start visa & mobilisation for Imran Khan?" now wraps to two lines; the text ends at x 311 and the close button starts at 315. |

## The redirect I could not explain in PROF-02: found

It happened again here and the web server's log shows what it is: `GET /ar 307` followed by `GET /ar/overview`, with no request for the sign-in page. Something sent the tab to the site's root a few seconds after I switched the browser pane between its desktop and phone viewports; the app has no code that navigates to the root. Repeating the same steps without switching viewport, the page stayed where it was. So it is the test browser, not the product. PROF-02's evidence has been corrected.

## Data

- The walkthrough's rows were deleted on the owner connection: Imran Khan's onboarding employee record with its sequence and 11 steps, and the work-permit procedure. Candidates were returned to their seeded stages by the re-seed.
- After the final suite and re-seed: 41 employees, 3 sequences, candidate stages as seeded, 0 accounts with an authenticator enrolled.

## Not done

- The warning is not shown on the Work queue or anywhere a procedure is advanced, only where one is started (the ADR's rule).
- No warning when a band is on file but old. The note states the date and leaves the judgement to the reader.
