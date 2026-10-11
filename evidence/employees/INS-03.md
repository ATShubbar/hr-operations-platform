# INS-03 — Medical insurance and driving licence: ladder, report, sample data — Evidence

- Date: 2026-10-11
- Status: **done** — closes the batch INS-01..03
- Card approved ("approved for all 3"). ADR-021 rev. 3.

## What was built

**Notification ladder.** The two documents are watched like the other four.

| Rule | Value |
|---|---|
| No date on file | Not watched |
| Saudi nationals | Watched (unlike iqama and work permit) |
| Owner | The client's named officer; where none is named, the HR officers |
| Needs | `govdata.read` (their dates are in the government-data group) |
| Quiet while being renewed | Never, for now — no procedure renews them (INS-04) |
| Client manager | Told once one has lapsed, while their portal is on |
| Employee | Their own, at every stage |

Files: `packages/contracts/src/escalation-rules.ts` (`EMPLOYEE_DOCS`, owners), `apps/api/src/modules/escalations/domain/ladder.ts`, `…/application/escalations.service.ts`; panel labels and the rules dialog's wording in `apps/web/messages/*.json`.

**Compliance report.** Two new rows: Medical insurance and Driving licence (`reporting.service.ts`, labels in both languages).

**Sample data** (`prisma/seed.ts`). Everyone still in post gets a policy number and an insurance date well outside the 30-day window. Eight named people get dates that land on each stage, and five of them a driving licence. All four columns are written on every run, so a re-seed puts back whatever a walk-through changed.

**Smoke check** (`scripts/uat-smoke.mjs`): three new checks.

## Tests

Written first.

| Spec | New | Before the code | After |
|---|---|---|---|
| `test/escalation-ladder.e2e-spec.ts` (rules, no database) | 6 | 6 failed | passed |
| `test/escalation-insurance.e2e-spec.ts` (the register, three audiences) | 3 | 3 failed | passed |
| `test/reporting-service.e2e-spec.ts` (one case extended) | – | failed | passed |

Then each rule was broken to see a test fail, and the file restored byte for byte:

| # | Broken | Failed as expected |
|---|---|---|
| 1 | The dates are readable without `govdata.read` | yes |
| 2 | Treated as expat-only (a Saudi's are skipped) | yes |
| 3 | Owned by the GRO officers | yes (2 tests) |
| 4 | Quietened by an unrelated open procedure | yes |
| 5 | The service does not pass the stored dates to the rules | yes (3 tests) |

"Told to a client only at Breach" was not broken again here: that rule belongs to every document and was proven in NC-05.

Full API suite: **877/877** (868 + 9). Contracts 32/32. Web typecheck, lint and production build clean.

## Figures against the database (clean seed, local)

Insurance or licence inside 30 days or lapsed, people under management — the database and the HR officer's ladder agree, item for item:

| Person | Document | Days | Stage |
|---|---|---|---|
| Shah Mohammed | Driving licence | −6 | Breach |
| Syed Ali | Medical insurance | −4 | Breach |
| Joseph Santos | Medical insurance | 5 | Escalated |
| Hassan Alyamani | Driving licence | 9 | Reminder |
| Ahmed Hassan | Medical insurance | 10 | Reminder |
| Mahmoud Abdelrahman | Driving licence | 21 | Notice |
| Rajesh Kumar | Medical insurance | 27 | Notice |

Each is owned by its company's named officer (every sample company names one), so the "HR officers by type" rule shows only in the tests.

| Viewer | Items | Needing action |
|---|---|---|
| HR officer | 35 (13 breach · 7 escalated · 7 reminder · 8 notice) | 20 |
| GRO officer | 36 | 16 |
| Client manager (portal off) | 1 | 1 |
| Employee (Ahmed Hassan) | 3 (insurance, iqama, work permit) | – |

Compliance report, as Administrator, Arabic:

| Row | Expired | ≤30d | ≤60d | ≤90d | Total | Database |
|---|---|---|---|---|---|---|
| التأمين الطبي | 1 | 3 | 2 | 1 | 7 | same |
| رخصة القيادة | 1 | 2 | 0 | 0 | 3 | same |

Overview: "Documents expiring · 30 days" went 14 → 19, "inside seven days" 6 → 7. The five added are the three insurance and two licence dates between today and 30 days.

## On screen

- The bell's panel, Arabic, as HR officer: «رخصة القيادة: انتهت الصلاحية», «التأمين الطبي: انتهت الصلاحية», «التأمين الطبي: تنتهي خلال 5 أيام». No untranslated key.
- The compliance report's two rows read in Arabic as above.

## Smoke check

Run against the local servers: **all checks passed**, including

- insurance and licence: both are on the ladder
- insurance and licence: an officer reads the numbers and dates on the record
- insurance and licence: the employee sees their own policy number and date

What the run left behind (one request and its task, one leave request, ten deleted test documents, one read mark) was removed, and the database re-seeded.

## A correction to an earlier card

The ladder totals quoted in NC-06 were one too high: a request left over from an earlier walk-through was counted as seeded. `evidence/escalations/NC-06.md` now says so. It was found here because the totals did not add up (29 + 7 new ≠ 35).

## For UAT

The sample data changed, so **Seed UAT (seed-and-smoke)** needs one run for UAT to show insurance and licence dates. Until then the screens work and every person's two documents are simply empty.

## Not done

- Renewal as a procedure (INS-04).
- The dependant rows of the runway (DEP-05).
- The administrator account's authenticator was enrolled for the report check and cleared afterwards (10 seed accounts, 0 enrolled).
