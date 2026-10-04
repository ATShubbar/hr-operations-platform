# REQ-05 — Reassign a request without changing its status — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → REQ-05 (found in DS-12). Status: **done**.

## Owner decisions

| Question | Answer |
|---|---|
| Which requests can be reassigned? | **Approved ones** (recommended): In progress or Info needed. Open requests keep "Approve and assign". |
| Can a request be left with nobody? | **No, only reassign** (recommended). |
| Tell the new assignee? | **Yes** (recommended): "A request was assigned to you", in-app plus email per their preferences; not when you take it yourself. |

## What was built

| Piece | What |
|---|---|
| `POST /requests/:id/assign {assigneeUserId}` | `request.process`, staff only (`scopeOf` refuses anyone else first). `in_progress`/`info_needed` only: open → 400 ("assigned when it is approved"), finished → 400. Status, the wait (`infoReturnsTo` / `infoNeededSince`) and due date untouched. Audited `request` / `assign` (before/after assignee). Contract `.strict()`, with a uuid required (null or missing → 400). |
| **Assignee validation**, on `assign` AND `process` | The assignee must be an **active STAFF account whose role holds `request.process`** (Administrator, HR officer, GRO officer, read from the permission catalog rather than a second list). Before this, `process` accepted any id at all: a client manager's, an employee's, a disabled account or an unknown uuid. |
| `RequestAssignedEvent` → `RequestAssignedHandler` | The new assignee is told "A request was assigned to you" / «أُسند إليك طلب» (category `request`). It fires on a reassignment and on Approve and assign (which also hands the request to someone), never when you assign it to yourself. |
| Decision trail | `assign` → "Reassigned" / «أُعيد إسناده». |
| Web — Work queue | The row's assignee picker now works for approved requests too (`request.process`), through the new route, and **offers only the three roles that work on requests** (the Auditor isn't shown and then refused). `queue-actions.ts` gains `assign()`, which routes per kind; the work-item dialog only displays the owner, as before. |
| Web — request detail | Staff see **Reassign** in the "Assigned to …" block, a popover of eligible people other than the current one. The page reloads and the trail refreshes. |
| Registries | Isolation `staff`; audited writes `request.assign`. |

## Tests

`test/request-assign.e2e-spec.ts`: **7/7**:
1. Reassign in progress: status stays, the new assignee is told, audited, on the trail.
2. Reassign while info needed: status, return target and wait start untouched.
3. Taking it yourself tells nobody.
4. Open, resolved, closed, cancelled → 400, assignee unchanged.
5. Null or missing → 400; a client manager, an employee, the Auditor, a **disabled** HR officer and an unknown id → each 400; the assignee unchanged.
6. **`process` refuses a client manager as assignee** (status unchanged); approving with the GRO officer works **and tells them**.
7. Client manager, Auditor, employee → 403; unknown request → 404.

**Red proofs** (each removed, its tests went red, restored, byte-identical):

| Removed | Tests that went red |
|---|---|
| the assignee check (accept anyone) | the wrong-assignee test + `process` |
| the approved-only guard | the status test |
| the self-assign silence | "taking it yourself" |
| approve-and-assign's notification | the `process` test |

**Full API suite: 654/654** (647 + 7). No other spec depended on the old any-id behaviour. `@hr/api`, `@hr/web` and `@hr/contracts`: lint + typecheck green.

## Live (local, browser) — HR officer

- **Work queue:** two in-progress requests ("Iqama renewal — Ahmed Hassan", "Exit-reentry visa — Anil Thomas") now have an assignee picker. Opened by a real click, it offered only Administrators, HR officers and the GRO officer, with **no Auditor**. Picking Turki Al-Harbi (GRO): the row shows "Turki · GRO officer" and the server says still `in_progress`.
- **Request detail:** "Assigned to Turki Al-Harbi · GRO officer · Reassign · Open work queue". The trail shows **"Reassigned"**. Reassign (real click) offered the five eligible people other than Turki. Choosing Omar Al-Shehri (the signed-in user) gives "Assigned to Omar Al-Shehri", status unchanged.
- **Notifications (DB):** `staff-gro_officer` got "A request was assigned to you" / «أُسند إليك طلب» **once**; Omar, who took it himself, got none. Two `assign` audit rows.
- **Arabic, 375px:** «أُسند إلى Omar Al-Shehri · أخصائي موارد بشرية · إعادة الإسناد · فتح قائمة العمل», trail «أُعيد إسناده», 0px overflow.

**Cleanup:** the assignee reset to none, the test notification deleted, signed out.

## Found, filed (not fixed here)

**ASSIGN-01:** task and GRO-procedure assignees are not validated either (any id is accepted). It needs REQ-05's rule per kind, as its own card.
