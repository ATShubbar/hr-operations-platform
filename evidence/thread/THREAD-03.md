# THREAD-03 — Ask for more detail — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → THREAD-03. Decision record: **ADR-016**, now **rev. 2**; the architecture.md v1.10 line now points to it. Status: **done**.

## Owner decisions

| Question | Answer |
|---|---|
| Must staff say what's missing? | **A required note** (recommended), posted to the thread as their comment in the same step. |
| On an employee-raised request, whose reply brings it back? | **The employee or their company's client manager** (recommended). Both are on the requester's side and both see the thread. |
| Where does it go back to? | **Where it was** (recommended): Open, or In progress with its assignee. **This revises ADR-016**, which said `open`, so it is recorded as rev. 2. |

## What was built

| Piece | What |
|---|---|
| Migrations | `20261004200000_request_status_info_needed` adds the enum value, in its own migration because Postgres won't use a new value in the transaction that adds it.<br>`20261004200100_request_info_returns_to` adds:<br>• column `info_returns_to`;<br>• CHECK: `info_needed` ⇔ a return target, and the target is only open/in_progress;<br>• trigger **`req_requests_info_guard`**: entering requires the previous status to be open/in_progress and recorded exactly, never by the client or employee roles; those roles may leave only to the recorded status; the target is fixed while waiting;<br>• `GRANT UPDATE (status, info_returns_to, updated_at)` to `app_employee`, with policy **`employee_reply_returns`** (a waiting request they raised). |
| Workflow | `open → info_needed`, `in_progress → info_needed`, `info_needed → open \| in_progress \| cancelled` (staff, by hand). Anything else → 400. |
| `process` (staff, `request.process`) | `{status: 'info_needed', note}`: the contract **requires** a note (1–4000) for `info_needed` and **refuses** one for anything else (`.strict()` plus a refine).<br>In one transaction: status + `infoReturnsTo = previous status`, audit `ask-info`, the note created as the asker's comment and audited.<br>The existing `RequestStatusChanged` notification gets dedicated content: **"More detail needed on your request"** / «مطلوب مزيد من التفاصيل لطلبك». The note does NOT also fire a "new comment" notification. |
| The requester's reply | `requester-reply.ts` `returnIfWaiting` runs **in the reply's own transaction, on the replier's fenced connection**:<br>• after a comment from the client or employee path (`RequestThreadService`);<br>• after a file from those paths that came out of confirm `available` (`RequestAttachmentsService`, re-reading the request on that connection).<br>A conditional update moves `info_needed → info_returns_to` and audits `info-returned`. Staff replies never call it. |
| Status consumers (API) | Calendar view: already active (terminal = closed/cancelled), test-pinned. Reporting `service-operations`: new column **`reqInfoNeeded`**, which would otherwise have been counted as done. |
| Web | **Requests:**<br>• **Ask for more detail** (was a disabled "Coming soon") for open requests beside Approve/Decline, and for in-progress ones beside "Move to…";<br>• `ask-info-dialog.tsx` (required note; resets on every opening, per the DS-09 landmine);<br>• `info-needed-banner.tsx` (staff: "Waiting on the requester…"; requester side: "PEOPLE&GRO needs more detail — reply below…");<br>• "Move to…" offers the hand moves out of `info_needed`;<br>• the status filter includes it;<br>• the thread re-reads the request after a requester-side post (`onPosted` / `onAttached`).<br>**`/me/requests`:** the same banner and a **quiet** reload (no skeleton flash).<br>**Elsewhere:** tone **warning** (amber; the prototype tells pending and info apart, and our `open` is already blue); queue, reports dashboard and My file count it as open work; labels, trail actions (`ask-info`, `info-returned`) and the report column in en + ar; the dead `requests.soonHint` key removed. |

## Tests

`test/request-info-needed.e2e-spec.ts`: **15/15**.

**Through the API:**
1. Ask with a note → `info_needed`; the trimmed note is the thread's only comment (staff), and the requester is notified.
2. No note, a blank note or 4001 characters → 400, status unchanged.
3. The client manager and the **Auditor** get 403.
4. From **in progress** with an assignee: the client manager's comment returns it to **in progress with the assignee kept**, and `infoReturnsTo` is cleared.
5. A **quarantined (EICAR) file does not** return it; a confirmed PDF does.
6. **Staff comments and staff files never return it.**
7. On an employee-raised request, the **employee's** comment returns it, and so does the **client manager's** on another one.
8. The employee who raised it is notified when asked.
9. The legal moves:
   - asking from `resolved` → 400;
   - `info_needed → resolved` → 400;
   - `info_needed → in_progress` by hand clears the target;
   - `→ cancelled` works;
   - a note on a non-ask → 400.
10. The decision trail contains `ask-info` and `info-returned`.
11. `?status=info_needed` filters; the request is on `/calendar/view`.
12. The Service operations report has `reqInfoNeeded` and counts it.

**At the database:**
- The client role leaving `info_needed` to `resolved` or to the wrong status → refused; to the recorded status → allowed.
- The employee role: to `cancelled` → refused, renaming → refused, a **colleague's** waiting request → 0 rows; their own, to the recorded status → allowed.
- Staff entering with the wrong target, no target, a target without the status, or from `resolved` → all refused.

**Red proofs** (each piece removed, its tests went red, restored, byte-identical):

| Removed | Tests that went red |
|---|---|
| reply step made a no-op | 4 (client return, file return, employee + manager return, trail) |
| guard trigger disabled | all 3 database tests |
| `employee_reply_returns` dropped | the employee return (API) + the employee fence |
| staff-reply guard removed (thread + files) | "staff never return it" |
| report column removed | the report test |

**Full API suite: 632/632** (617 + 15). The thread specs together: 41/41 after the final change. `@hr/api`, `@hr/web` and `@hr/contracts`: lint + typecheck green.

## Live (local, browser)

**HR officer (en, desktop)**, on seed request A0000001 (open), through the real button and dialog:
- **Ask stays disabled while the note is empty.**
- The note was typed with the keyboard; Ask produced:
  - the pill "Info needed" (list + detail) and the banner "Waiting on the requester";
  - the note appearing **immediately** as the thread's third comment;
  - the decision trail reading "Asked for more detail · Omar Al-Shehri · HR officer".
- Repeated on A0000001-…004 with the same result.

**Client manager A (en):**
- Saw the requester banner "PEOPLE&GRO needs more detail — …".
- Replied "Al Rajhi Bank, Olaya branch." with the keyboard. In place, **the banner disappeared and the pill went to Open** (list + detail); the server says `open`.

**Employee Ahmed Hassan (ar, 375px)**, on a request they raised where HR had asked «إلى أي جهة تُوجَّه الشهادة؟»:
- Saw the amber «بانتظار معلومات» pill, the banner «يحتاج فريق PEOPLE&GRO إلى مزيد من التفاصيل…» and the question.
- Replied «إلى مصرف الراجحي.». In place, the pill went to «مفتوح» and the banner went, with **no skeleton flash** and 0px overflow.

**Work queue (HR):** the waiting request is listed with "Info needed".

**Reports:** the column is proven by the API test. The web label exists in both languages, but the screen is Administrator/Auditor-only and both need an authenticator locally, which wasn't enrolled for this.

**Bug caught live, fixed:** the thread re-mounts after asking (the note is posted server-side), and its key `${id}-${n}` **collided with the decision trail's** identical key. React then dropped one of the two siblings, so the comments rendered empty ("Encountered two children with the same key"). Now keyed `thread-…` and `trail-…`. Re-verified: the note appears at once, and no new key errors.

**Bug caught at cleanup, fixed:** **re-seeding failed** ("violates check constraint"). The seed resets seeded requests to their seeded status but left `info_returns_to` set, so a request someone had put in `info_needed` could not be reset. That would have broken **Seed UAT** the first time anyone asked for detail there. The seed's update now clears it. Re-seeded: 4 open / 2 in progress / 1 resolved / 1 closed / 1 cancelled, 3 comments.

**Found, not fixed (pre-existing):** a client manager sees their own company as an id fragment (`11111111`) in the request detail. The screen names clients from `/clients`, which they can't read. DS-18 fixed the same root cause for New request's picker.

**Cleanup:** the employee's verification request (with its comment, task and notifications) and the verification notifications were deleted, and the database re-seeded.
