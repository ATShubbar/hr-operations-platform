# PROF-07 — Open a client record on a tab; find a client by registration number — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved for all 3"). ADR-015 rev. 1.

## 1. The client record opens on the tab named in the address

`/clients/<id>?tab=fees` opens the Fees tab. Same rule as the Person record: read once on arrival, an unknown name is ignored.

- `apps/web/src/app/[locale]/(app)/clients/[id]/page.tsx` — one effect.
- First use: on Reports, each company in "Fees by client" now links to that company's **Fees** tab (it used to open the Overview).

Checked locally as Administrator:

| Address | Tab shown |
|---|---|
| `…/clients/<Alpha>?tab=fees` | Fees |
| `…/clients/<Alpha>?tab=nope` | Overview |
| Reports → Fees by client | 4 links, each ending `?tab=fees` |

Switching tabs by hand does not rewrite the address. The Person record behaves the same way.

## 2. Global search finds a client by its commercial registration number

ADR-015 left this out because the number was not stored then. It has been stored since PROF-01.

Rules (ADR-015 rev. 1):

- Staff with `client.read` only. A client manager gets **no company results**, as before, including for their own company's number.
- The query must be digits (spaces and dashes ignored), **at least four**, and must **begin** the number: the whole ten digits or the leading ones. Digits from the middle or end do not match.
- **Not audited.** A company's registration number is public-register data, not a person's identifier.
- A company result now carries the number, so a match on digits explains itself: "Client · CR 2050000002".

Files: `packages/contracts/src/search.ts` (the client result gains `crNumber`), `apps/api/src/modules/search/application/search.service.ts` (`matchesRegistration`), `apps/web/src/components/global-search.tsx` (the result line).

### Tests

`apps/api/test/search.e2e-spec.ts` — 5 new (16 in the file). Fixture numbers are random per run because the column is unique.

| Run | Result |
|---|---|
| Before the code | 2 failed (found by number; result carries the number). The three "must not" cases passed, which proves nothing yet. |
| After | 16 passed |

So each "must not" rule was broken to see a test fail, and the file restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | Matches digits anywhere in the number | yes |
| 2 | No four-digit minimum | yes |
| 3 | Company results not limited to staff | **no, at first** — then yes |

Proof 3 did not fail the first time: no client role holds `client.read`, so the permission alone already hid companies and the staff check was untested. A test was added that grants a client role that permission and still expects no company results. With it, proof 3 fails as it should.

One test is a guard, not a proof: "a registration-number search is not audited". There was no way to break it without writing new code.

Full API suite: **861/861**. Contracts 32/32. Web typecheck, lint and production build clean.

### On screen (local, as Administrator)

| Typed | Result |
|---|---|
| `2050 0000` (English) | Beta Contracting Est. — "Client · CR 2050000002" |
| `1010` (Arabic) | شركة الألف التجارية and مؤسسة الواحة للتجارة, each with «عميل · س.ت 101000000x» |

The Arabic line reads in the right order, number last.

## Not done

- Not checked at phone width. The only visible change is a longer second line in a search result, which truncates like the others.
- The search box's placeholder still reads "people, refs, ID numbers". It does not mention registration numbers.
