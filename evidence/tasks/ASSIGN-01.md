# ASSIGN-01 — Task and procedure assignees validated, and told — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → ASSIGN-01 (found in REQ-05). Status: **done**.

## Owner decision

| Question | Answer |
|---|---|
| Tell the person a task or procedure is handed to? | **Yes, same as requests** (recommended): in-app plus email per their preferences; never when you take it yourself. |

## What was built

| Piece | What |
|---|---|
| `UsersService.isActiveStaffWith(userId, permission)` (Auth) | **One rule for every work item:** an ACTIVE STAFF account whose role holds the kind's permission, read from the catalog. Requests (`request.process`, REQ-05) were refactored onto it, so the three kinds can't drift. |
| Tasks | `create` and `update` refuse an assignee who doesn't hold `task.update` (400). Clearing (`null`) is still allowed: unassigned tasks are normal (requests spawn them). **`TaskAssignedEvent`** is published after commit when the assignee actually changes; re-saving other fields with the same assignee is not a new assignment. `TaskAssignedHandler` sends "A task was assigned to you" / «أُسندت إليك مهمة», category `task`, never to the person who did it. |
| GRO procedures | `create` and `update` refuse an assignee without `gro.process` (400); clearing is allowed (document-expiry spawns unassigned procedures). GRO already calls Notifications directly (the GRO-03 design), so it notifies in place: "A procedure was assigned to you" / «أُسندت إليك معاملة حكومية», category `general` like its status notices, never self. GRO now imports Auth (no cycle). |
| Web | The work queue's assignee picker offers **only the roles that work the item** (`ASSIGNEE_ROLES`) for every kind, so the Auditor is no longer offered and then refused. |

Who holds the permissions today (from the catalog): `task.update`, `gro.process` and `request.process` are each held by **Administrator, HR officer, GRO officer**, and only those.

## Tests

`test/assignee-rules.e2e-spec.ts`: **4/4**. Per kind, over HTTP:
- Creating with an eligible person → 201, and they're told.
- Each of: a client manager, an employee, the Auditor, a **disabled** GRO officer, an unknown id → **400**, with no row created.
- Reassigning: the same refusals; taking it yourself tells nobody; handing it to someone tells them; **re-saving with the same assignee doesn't re-notify** (tasks); clearing to null → 200.

**REQ-05's 7 tests still pass** on the shared rule.

**Red proofs** (each removed, its tests went red, restored, byte-identical):

| Removed | Tests that went red |
|---|---|
| the shared rule accepts anyone | **6**: all four ASSIGN-01 tests AND REQ-05's two assignee tests (one rule really does govern all three kinds) |
| tasks tell nobody | 2 |
| tasks re-announce an unchanged assignee | 1 |
| procedures tell you about your own assignment | 1 |

**A spec corrected on purpose:** `tasks.e2e-spec` (TASK-01) assigned a task to a *random UUID* to test list scoping, which the new rule rightly refuses. "bob" is now a real helper GRO officer; the test still proves the same own/assigned filter.

**Full API suite: 658/658** (654 + 4). `@hr/api` and `@hr/web`: lint + typecheck green.

## Live (local, browser) — HR officer, Work queue

- **Task** "Chase expired iqama — Syed Ali": the picker (real click) offered **6 people — Administrators, HR officers, the GRO officer; no Auditor**. Handed to Turki Al-Harbi: the DB shows him as assignee, and he got "A task was assigned to you" / «أُسندت إليك مهمة» (category `task`). The task then left HR's own-scoped list, as expected.
- **Procedure** "Work permit renewal": the same six offered. Handed to Huda Al-Qahtani, who got "A procedure was assigned to you" / «أُسندت إليك معاملة حكومية» (category `general`).

**Cleanup:** the test notifications deleted, the seed's assignments restored by re-seeding, signed out.

## Found, filed (not fixed here)

**TASK-05:** a task spawned from a request still gets a hard-coded "3 working days, Sun–Thu" due date (`tasks/domain/working-days.ts`, TASK-03). That ignores the request's own service level (THREAD-04) and the company's `working.week`, and duplicates the working-day maths now in `@hr/dates`.
