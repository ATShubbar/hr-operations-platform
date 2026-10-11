# INS-04 — Renewal procedures for medical insurance and driving licence — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved ("approved"). Owner decisions: renewal **and** conversion for the licence · the prototype's figures as standard fees.

## What was built

Three procedure types: **Medical insurance renewal**, **Driving licence renewal**, **Driving licence conversion** (a foreign licence converted to a Saudi one, as in the prototype).

| Behaviour | How |
|---|---|
| Started like any procedure | The start dialog on the Person record, the Client record and the Overview lists them. HR officers, GRO officers and Administrators already may start and complete procedures; no permission changed |
| An open one quiets the reminder | Insurance renewal → the insurance. Licence renewal or conversion → the licence. Only that document, only that person, only while open |
| Completing writes the new date | The completion dialog asks for the resulting expiry and saves it to the record. A conversion sets the licence date, as a renewal does |
| Fee | The completion dialog prefills the standard fee: insurance renewal SAR 1,800 (CCHI), licence conversion SAR 400 (Absher), licence renewal SAR 0 (Absher). Prototype figures, not verified; an Administrator changes them in Settings |

Files: `prisma/schema.prisma` + migration `20261017120000_gro_types_insurance_licence`; `packages/contracts/src/gro.ts`, `billing-lists.ts`, `escalation-rules.ts`; `apps/api/src/modules/gro/domain/gro-effects.ts`; web `start-procedure-dialog.tsx`, `lib/gro-workflow.ts`, `lib/fees.ts`, `messages/*.json`; `prisma/seed.ts`; `scripts/uat-smoke.mjs`.

## The standard-fees setting

The setting must name every procedure type; a copy saved before this card would lack the three new ones. Migration `20261017130000_standard_fees_insurance_licence` adds the missing ones to a saved copy and touches nothing else.

Proven on the local database before it was applied:

| Step | Result |
|---|---|
| Stored an old-shape copy (8 procedure types) with one custom figure (iqama renewal SAR 10,000) | – |
| Applied the migrations | 11 procedure types; the custom figure kept; step fees and the dependant fee untouched |
| Removed one new type and set another to a custom 5, ran the same statement again | The missing one came back at its default; the custom 5 was kept |
| Ran it a third time | 0 rows changed |

The test row was then removed. Where nobody has saved the setting there is no row and the migration does nothing.

## Tests

Written first, in five specs.

| Run | Result |
|---|---|
| Before the code | **7 failed** |
| After | 63 passed in the five specs |

Each rule was then broken to see a test fail, and the file restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | An insurance renewal writes the licence date | yes |
| 2 | A conversion does not quiet the licence | yes |
| 3 | An insurance renewal quiets nothing | yes (2 tests) |
| 4 | One type missing from the contract | yes |

INS-03's test "are never quiet" was replaced by "go quiet while their own renewal is open", since that rule changed on purpose.

Full API suite: **882/882** (877 + 5). Contracts 32/32. Web typecheck, lint and production build clean.

## Checked on screen (local, as HR officer)

On Syed Ali, whose insurance lapsed four days ago:

| Step | Result |
|---|---|
| Start a procedure (Arabic) | The list shows «تجديد التأمين الطبي», «تجديد رخصة القيادة», «تحويل رخصة القيادة» |
| Start the insurance renewal | His lapsed insurance left the ladder: 35 items → 34, quiet 6 → 7 |
| Open work tab → Resolve → Completed | Dialog "Complete Medical insurance renewal": asks the resulting expiry; amount prefilled **1,800**; paid to **CCHI** |
| Enter 7 Oct 2027 → Complete | Procedure completed. Insurance expiry on the record: 7 Oct 2027. Licence date untouched. Fee `GF-1400`, SAR 1,800, CCHI, recorded. Toast "SAR 1,800 recorded as GF-1400" |

The three status moves before "Completed" were made through the API to save time; the completion itself was through the screen.

## Sample data

One open insurance renewal for Joseph Santos (reference CCHI-2026-0412, due in 3 days, with the HR officer). His insurance, five days from lapsing, is therefore quiet, and the renewal carries it in the queue instead.

| HR officer, clean seed | Before | After |
|---|---|---|
| Items | 35 | 35 (one expiry out, one queue item in) |
| Needing action | 20 | 19 |
| Quiet | 5 | 6 |

## Smoke check

One new check: "insurance and licence: an open renewal keeps its expiry quiet". Run against the local servers: all checks passed. The run's leftovers were removed and the database re-seeded.

## Not done

- The old daily document scan does not open these renewals by itself.
- Settings → Standard fees was not opened to look at the three new boxes (it needs an Administrator's authenticator locally). The page builds its boxes from the same list the tests check, and the labels are the ones the start dialog showed.
- Not looked at separately at phone width: no layout changed, three entries joined existing lists.

## For UAT

Run **Seed UAT (seed-and-smoke)** once `/api/health` shows this commit — not before.
