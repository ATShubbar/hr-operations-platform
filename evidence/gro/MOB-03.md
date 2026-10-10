# MOB-03 — The Person record's Mobilisation tab — Evidence

- Date: 2026-10-10
- Status: **done**
- Decision: ADR-018. Card approved by the owner, including the History addition, which the card named up front.

## What changed

| File | Change |
|---|---|
| `employees/[id]/mobilisation-tab.tsx` (NEW) | The prototype's tab, in four parts, described below. |
| `employees/[id]/page.tsx` | Mobilisation is a real tab. Nothing on the Person record is "coming soon" any more. |
| `employees/[id]/history-tab.tsx` | Sequence entries are labelled, e.g. "Step filed · Block visa requested (Onboarding)" or "Sequence cancelled · Onboarding". Tones: start info, file/complete success, cancel warning. Titles are isolated for bidi. |
| `messages/en.json`, `ar.json` | `person.mob.*`: every step's title and note. The English is the prototype's, word for word; the Arabic is translated. Also `person.history.action.gro-sequence.*`. `person.soon` removed. |

**The tab, part by part:**
- **Nothing running:** "No sequence running" with the prototype's sentence, plus **Start onboarding** / **Start final exit**. Only what may start is offered.
- **The running sequence, or the most recent one, in full:**
  - label, description + "Started …", "Next: …", "N of M filed" with a progress bar, "N waiting on something else", and Cancel sequence;
  - every step: number, title, "portal · note", "Waiting on …" or "Filed 10 Oct 2026 · Turki Al-Harbi", target date in both calendars, the fee ("SAR 2,000" / "No fee", for information), and **Mark filed** / *Blocked* / **Reopen**.
- **Dialogs:** Mark filed asks the filed-on date (today, `max` = today), and shows the target and the fee note. Cancel has a confirmation.
- **Earlier sequences:** a compact list.

**The tab's rules:**
- Changes need `gro.process`; the Auditor reads.
- A completed final exit offers no Reopen.
- Refusals are explained in the viewer's language.

## The API additions

**1. History (named in the card).** ADR-018 says sequence changes appear on the Person record's History, but `GET /employees/:id/history` asks the audit trail for named record types only.

| File | Change |
|---|---|
| `packages/contracts/src/employee-history.ts` | `historyResourceSchema` gains `gro-sequence`; `subject` gains `{ kind: 'gro-sequence', sequence, step }`. |
| `audit/application/audit-query.service.ts` | `forRecords` rows carry `sequence: { kind, step }`, read from the snapshot **inside** the service. Snapshots still never leave it. |
| `history/api/employee-history.controller.ts` | Asks for `gro-sequence` entries keyed to the employee and names the sequence and step. |

The test is in `gro-sequences-api.e2e-spec.ts`:
- The person's History lists `cancel, file-step, file-step, reopen-step, file-step, start` (newest first), with the exact subjects (`step: 'clearance'` on that filing, `null` on start/cancel).
- No `sequenceId` appears in the response, and nothing appears on a colleague's History.
- **Red before the change, green after.** **Red proof:** dropping the `gro-sequence` source fails it again; the file was restored byte-identical.

**2. `needs` on each step.** The tab has to say "Reopen *X* first" in the viewer's language, and `waitingOn` only describes blocked steps. So the response now includes each step's `needs` (keys from the fixed step list). The exact-keys test was updated with it.

## Live (GRO officer on Syed Ali; dev servers restarted)

| Check | Result |
|---|---|
| Empty state | "No sequence running" + the prototype's sentence; buttons **Start onboarding**, **Start final exit**. |
| **Start onboarding** | `POST /employees/:id/sequences {"kind":"onboarding"}`. Shows "From block visa to first payroll. Started 10 Oct 2026.", "Next: Block visa requested", "0 of 11 filed", 0%, "10 waiting on something else". |
| **Mark filed** (block-visa) | Dialog "Mark as filed · Block visa requested · Qiwa", target 10 Oct 2026 · Rabiʻ II 29, 1448 AH, date = today with `max` today, note "The standard Qiwa fee is SAR 2,000. Shown for information — recording fees comes with billing." Sends `…/steps/block-visa/file {"filedOn":"2026-10-10"}`. Then "Next: Visa authorisation issued", 1 of 11, 9%. |
| **Reopen refused, explained, no request** | With visa-auth filed, Reopen on block-visa shows "Reopen Visa authorisation issued first — it was filed on the back of this one." **0 requests sent.** Reopening visa-auth and then block-visa works (back to 0 of 11). |
| Layout at 1280 | Step columns **22 / flex / 124 / 88 / 96 px** (the prototype's), the ready row tinted, 0px overflow. |
| **Cancel** | Confirm "The sequence stops where it is and stays in this person's history. A new one can be started later." (Keep it / Cancel sequence). Afterwards: the empty state returns with both Start buttons; the cancelled run is shown with a *Cancelled* pill, **0 Reopen buttons**, and no "Waiting on" lines; an older run is listed under **Earlier sequences**. |
| **History** | "Sequence cancelled · Onboarding", "Step filed · Block visa requested (Onboarding)", "Step reopened · Block visa requested (Onboarding)", "Step reopened · Visa authorisation issued (Onboarding)", "Step filed · Visa authorisation issued (Onboarding)", "Step filed · Block visa requested (Onboarding)", "Sequence started · Onboarding". |
| **Completed final exit** | The list response was rewritten in the browser, because completing a real one before MOB-05 would leave a finished exit on an active person. Result: *Completed* pill, 8 of 8 filed, 100%, **0 Reopen, 0 Mark filed, no Cancel**. |
| **Auditor** (temporary TOTP, cleared after: 0 seed accounts enrolled) | Reads the running onboarding, 11 steps, **0 buttons**. |
| `/ar/…` at 375 | Arabic throughout: «الاستقدام», «التالي: طلب تأشيرة العمل», «أُنجز 0 من 11», «10 خطوات تنتظر غيرها», «تسجيل الإنجاز», «متوقفة». **0px page overflow, 0px in every card and row.** |

## Three defects caught while verifying, all fixed

1. **Mark filed dropped to its own line at the far left on a phone**, away from its fee (right edge at 122px of 375). The fee and the action now share one end-aligned line below `sm` (button right edge 339). From `sm` the wrapper dissolves (`sm:contents`) into the prototype's 88px + 96px columns.
2. **Mixed-language step names were scrambled in Arabic.** «اجتياز فحص GAMCA الطبي» rendered as «الطبي GAMCA اجتياز فحص». Under ADR-012's LTR layout, an Arabic line holding a Latin word is laid out run by run, left to right.
   - **Fix:** titles, notes, "Waiting on", "Filed … · name", targets, the header lines and the History titles are isolated (`<bdi>` inside a span).
   - **Measured:** the first word is now rightmost (x 189–216), GAMCA in the middle (101–150), the last word leftmost (70–98).
   - This is UX-18's class of bug, fixed where this card touched.
3. **A finished run still showed "Waiting on …" in amber**, and the confirm title read "Cancel this Onboarding?". "Waiting on" now shows only while a run is running, and the title is per kind ("Cancel this onboarding?").

## Gates

- **Full API suite 723/723, twice.** API `typecheck` and `lint` are clean, and contracts build.
- Web `typecheck` and `lint` are clean. **`next build` succeeds**, run with the dev server stopped (`/[locale]/employees/[id]` 20.9 kB; contracts are imported as types only).

## Data

The three walkthrough runs on Syed Ali (two cancelled, one running) were deleted on the owner connection, so MOB-05's seed starts clean. Their audit entries remain, as audit entries do. Re-seeded.
