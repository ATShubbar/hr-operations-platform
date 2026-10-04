# THREAD-01 — Comments on a request's thread — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → THREAD-01. Decision record: **ADR-016** (architecture.md **v1.10**). Status: **done**.

## What was built

| Piece | What |
|---|---|
| `req_comments` (migration `20261004170000_request_comments`) | id, request (FK, restrict), `client_id` + `requester_employee_id` **copied from the request**, author, body, created_at. CHECK: 1–4000 characters after trimming. **Grants: SELECT + INSERT only, for every role**, so a comment cannot be edited or deleted by anyone, staff included (ADR-016 §3). |
| RLS | `staff_full_access` · app_client `client_isolation` + RESTRICTIVE **`client_comment`** (the request must exist with the SAME client and requester the row claims) · app_employee **`employee_own_read`** + **`employee_comment`** (the requester must be me AND the request must be one I raised, in that company). |
| `request.comment` (catalog) | Administrator, HR officer, GRO officer and Client manager. **Not the Auditor**, who reads the thread (via `request.read`) but cannot post. Pinned by `role-matrix.e2e-spec.ts`. Employees post through `/me` with `self-service.create`. |
| `RequestThreadService` (Requests) | list/add on the three paths. The request is looked up on the SAME path the caller has (staff Prisma, client `ScopedPrismaService`, employee `EmployeeScopedPrismaService`), so a request you can't see → **404**. Comment + audit (`request-comment` / `create`, `resourceId` = comment id, `after: {requestId, length}`; the text is not copied into the log) in one transaction, then **`RequestCommentAddedEvent`**. |
| Routes | `GET` / `POST /requests/:id/comments` (staff + client managers, via `scopeOf`) · `GET /me/requests/:id`, `GET` / `POST /me/requests/:id/comments` (employees, own only). All in the isolation registry; both POSTs in `AUDITED_WRITES`. |
| Author shape | `{name, kind: staff \| client \| employee}` + `mine`. **No email**; the keys are asserted exactly. |
| Notifications | `RequestCommentHandler` (`@OnEvent`): a **staff** comment → the request's creator; a **client / employee** comment → the assignee. Never the author, and nothing if there is no one. Bilingual ("New comment on a request" / "تعليق جديد على طلب"), category `request`, so the email preference applies. |
| Web: `requests/request-thread.tsx` | One component for staff, client managers and employees: an Attachments block ("next release" note, THREAD-02), the comments (avatar, name or **You**, side · time), and a composer, or a read-only line for the Auditor. Replaces DS-08's "coming soon" thread on `/requests`. |
| Web: `/me/requests` | Now **list + detail** (340px / 1fr from `lg`, stacked on phones), rows are buttons, `?r=` opens a request, a newly raised request opens itself, and the detail carries the thread. Global search's employee request results now land on the request (`/me/requests?r=`). |
| Seed | Three sample comments: HR asks which bank, Client A answers (Al Rajhi), and a GRO note on a second request. Re-seeding deletes the seed requests' comments first, so it stays idempotent. |

## Tests

`test/request-comments.e2e-spec.ts`: **10/10**.

**Through the API:**
- Staff post. The body is trimmed, the author keys are exactly `name` + `kind`, and **the requester is notified**.
- The client manager reads and replies. **The assignee is notified and the author is not**; the order and `mine` flags are right.
- Another company's request → **404**, for both read and write.
- **The Auditor reads (200) but posting is 403.** GRO posts (201).
- Validation: blank, 4001 characters, or an extra key → 400.
- Employees:
  - their own request and its thread are 200; a **colleague's is 404** (read, thread and post);
  - the client manager sees the employee's comment;
  - the staff routes are **403** to an employee.
- Every comment is audited as `request-comment` / `create`.

**At the database (raw role connections, no app in between):**
- A client manager cannot write onto **another company's** request, nor copy the requester wrongly.
- An employee cannot write onto a colleague's request. This includes **the harder forgery: a colleague's request labelled with MY employee id.** The read policy would let that row back out, so only `employee_comment` stops it. An employee sees only threads on requests they raised.
- **Nobody edits or deletes a comment — staff included** (update and delete both refused; the body is unchanged).

**Red proofs:**
1. `client_comment` loosened to `true` → the "other company" fence test failed. Restored → green.
2. `employee_comment` loosened → the "labelled with my id" forgery went through and the test failed. The first, easier forgery had NOT failed, because RETURNING is checked against the read policy. That is why the harder case was added. Restored → green.

**Bug the tests caught:** the first `client_comment` used unqualified column names inside its `EXISTS` subquery. Postgres resolved `client_id` to the SUBQUERY's table (`req_requests r`), so `r.client_id = client_id` compared a column with itself and the policy was a tautology. A client manager could comment onto any request id they could name. Fixed by qualifying (`req_comments.client_id`, `req_comments.request_id`, …). The migration was rewritten before it ever shipped, and re-applied locally from the file.

**Full API suite: 601/601, three times** (`pnpm turbo run test --filter=@hr/api`). `@hr/web`, `@hr/api` and `@hr/contracts`: typecheck + lint green.

## Live (local, browser)

| Who | What happened |
|---|---|
| HR officer (en, desktop) | Opened `/requests?r=a0000001-…001`. The seeded thread showed (HR's question, Client A's answer). Typed and posted a reply with the real keyboard; it appeared (**Comments 3**) and the box cleared. |
| Client manager A (en) | Posted on the same request. Reloaded: **Comments 4**, their own comment labelled **You** (Client), HR's labelled with the name (People & Gro), composer present. The DB showed a notification to `client_manager-a` for HR's comment (they created the request). The reply notified nobody: the seed request has no assignee. |
| Employee Ahmed Hassan (en, desktop) | `/me/requests` was empty. Raised "Salary certificate for Al Rajhi" through the dialog; **the new request opened itself** with the thread. Posted a comment, which showed as **You · Employee**. |
| Employee (ar, 375px) | The same detail in Arabic: 0px horizontal overflow. |
| HR officer (ar, 375px) | Opened the employee's request. Saw **Ahmed Hassan · الموظف** with their comment, and posted an Arabic reply. The DB shows **a notification to `employee-a` titled «تعليق جديد على طلب»** with `{kind: 'comment', requestId}`. 0px overflow. |

**Two Arabic defects found in verification, both fixed:**
1. **The count sat on the wrong side of "التعليقات", touching it.** The bidi algorithm pulled the digit into the Arabic run, so `ms-1.5` landed on the far side. The heading is now a flex row (`gap-1.5`). Measured: label 36→82px, count 88→97px (a 6px gap, the same order as English).
2. **An Arabic comment's full stop printed at the START of the line.** The layout is LTR in both locales (ADR-012), so free text took the page's direction. A comment is written in either language whatever the screen's, so its body is now wrapped in **`<bdi>`**.
   - Alternatives measured and rejected: `dir="auto"` and `unicode-bidi: plaintext` both **right-aligned** the Arabic comment inside the LTR layout, and `text-left` is lint-banned.
   - After the fix: the Arabic comment is left-aligned (right gap 24px), its first word at the right of the run, and the full stop at its end (0px from the left). English is unchanged (0px).

Cleanup: the verification request (with its comments, its spawned task and its notifications) was deleted, and the DB re-seeded. Result: **3 comments**, 9 requests, 0 employee-raised.

## UAT

The deploy runs on push. Running **Seed UAT** afterwards (owner) adds the three sample comments there.
