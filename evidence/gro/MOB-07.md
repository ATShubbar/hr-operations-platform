# MOB-07 — A filed step can record the iqama or insurance expiry — Evidence

- Date: 2026-10-11
- Status: **done**
- Card approved in the clean-up batch ("approved for all 6"). Owner's choice of scope:
  **insurance and iqama**.
- ADR-018 **rev. 3**.

## The gap

Two onboarding steps issue a dated document: "Iqama issued" and "Medical insurance activated".
The officer filing the step has the document in hand, but the expiry had to be typed again on
the Profile tab — and until then the new hire's iqama and insurance had no date, so nothing
watched them.

## What changed

| Where | Change |
|---|---|
| `POST /gro-sequences/:id/steps/:key/file` | Accepts an optional `resultingExpiry` (a real `YYYY-MM-DD` date) |
| Step responses | Each step carries `captures`: `iqama_expiry`, `insurance_expiry`, or `null` |
| The rule | `STEP_CAPTURES` in `gro/domain/sequence-definitions.ts` — onboarding `iqama` → the record's iqama expiry; onboarding `insurance` → its medical insurance expiry. Nothing else, and nothing on a final exit |
| The write | After the filing commits, through `EmployeesService.update(…, 'gro-completion')` — the same audited path a completed renewal procedure uses (GRO-03) |
| Mobilisation tab | The Mark-filed dialog shows one more date box on those two steps — "Iqama expiry" / "Medical insurance expiry" — with "Optional. Saved to this person's record." beneath; once a date is picked, the line shows it in Hijri |

Rules:

- **Optional.** A step files without it, exactly as before.
- **Refused (400), and nothing is filed,** when the date is not real, is on or before the filing
  date, or is sent for a step that records no expiry.
- **Reopening the step leaves the date where it is.** The document was issued; reopening corrects
  the filing, not the document. (A fee behaves differently on purpose — BILL-02 voids it.)
- If the write to the record fails after the step is filed, the step stays filed and the failure
  is logged. The officer can still set the date on the Profile tab.
- Staff only, `gro.process`, as filing already is. No new permission.

Files: `packages/contracts/src/sequence.ts`; `apps/api/src/modules/gro/` (`api/sequences.controller.ts`,
`application/sequences.service.ts`, `domain/sequence-definitions.ts`);
`apps/web/src/app/[locale]/(app)/employees/[id]/mobilisation-tab.tsx`; `apps/web/messages/*.json`;
`adr/ADR-018-onboarding-final-exit.md`.

## Tests

`apps/api/test/sequence-step-expiry.e2e-spec.ts` — 7 tests, written before the code. Against the
old code 5 failed; 2 passed vacuously (each asserts a refusal or an absence the old code also
produced), so the red proofs below are what show those two bite.

| Red proof | Tests that fail |
|---|---|
| An expiry on or before the filing date is accepted | 4 |
| Any step takes an expiry | 2 |
| The insurance step writes the iqama date | 2 |
| Nothing is written to the record | 3 |
| The date is not checked to be a real one | 4 |
| Restored (three files byte-identical) | 7 / 7 |

`test/gro-sequences-api.e2e-spec.ts` pins the step's keys exactly; `captures` was added to the
list (the same thing MOB-06 did for the run's `assigneeUserId`).

API suite: **921 / 921**. Contracts 34 / 34. Lint, typecheck and build clean for the API, the web
app and contracts.

## Checked on screen (local, as GRO officer, Arabic, 375px)

Bilal Ahmed's onboarding, step "Iqama issued" (ready). Before: no iqama expiry on his record.

| Step | Result |
|---|---|
| Open Mark filed | Fields: filing date · **«انتهاء الإقامة»** · amount paid · receipt. Note «اختياري. يُحفظ في سجل هذا الشخص.». The picker's earliest date is the filing date. Dialog 343px wide, no sideways overflow |
| Expiry = the filing date, press Mark filed | «يجب أن يكون تاريخ الانتهاء بعد تاريخ الإنجاز.» — **no request sent** |
| Expiry = 10 Oct 2027 | The note becomes «10 جمادى الأولى 1449 هـ» |
| Press Mark filed | `POST …/steps/iqama/file` with `{"filedOn":"2026-10-11","resultingExpiry":"2027-10-10"}` → 200; then the fee request → 201 |
| The database | `iqama_expiry = 2027-10-10`; audit rows `gro-sequence / file-step` and `employee / gro-completion`, both against Bilal Ahmed |
| Documents tab, without reloading | «الإقامة … 10 أكتوبر 2027 · 10 جمادى الأولى 1449 هـ · باقٍ 364 يومًا» |

Afterwards: the test fee deleted, the date cleared, the database re-seeded.

## Notes

- The seed does not reset a new hire's iqama or insurance expiry, so a date recorded this way on
  UAT survives "Seed UAT". Harmless (a date a year out is on no list) and left as it is.
- The note line ends in a full stop and so shows it at the start in Arabic — UX-20, not new here.
