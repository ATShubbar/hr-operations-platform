# TASK-05 — A spawned task follows its request's due date — Evidence

- Date: 2026-10-05
- Card: `BACKLOG.md` → TASK-05 (found in ASSIGN-01). Status: **done**.

## Owner decision

| Question | Answer |
|---|---|
| When a request's due date moves, does its task's move with it? | **Yes, while the task is open** (recommended). A finished task is left alone. Any change, in either direction. |

## The problem

The task a request spawns (TASK-03) got `addWorkingDays(new Date(), 3)`: a fixed 3 days on a hard-coded Sun–Thu week, from **a second copy** of the working-day maths (`tasks/domain/working-days.ts`). Since THREAD-04 the request itself is due by its type's service level in its company's `working.week`, so a GRO-service request (5 working days) had a task due in 3. And once the request's date moved (snooze, hand edit, pause), the task never followed, so the queue could show the task overdue while its request wasn't.

## What was built

| Piece | What |
|---|---|
| `RequestCreatedEvent` | Carries `dueDate`. **Fixed a slip it exposed:** the employee path published the row as inserted, before the system's due date was added (THREAD-04 sets it after commit). It now publishes the row WITH the date. |
| `RequestDueDateChangedEvent` (new, Requests) | Published after commit whenever a request's due date changes:<br>• staff `update` (hand edit, the queue's snooze);<br>• `updateForClient` (no role can reach it today, since client managers hold no `request.update`; it's there for when one does);<br>• `process` leaving `info_needed` (the pause, staff exit);<br>• `ServiceLevelService.extendAfterReturn` (the pause after a requester's reply, published by the service itself, because `RequestsService` depends on it).<br>No event when the date didn't actually change. |
| Tasks | The spawned task is created due **`event.dueDate`** (none if the request has none). `TasksService.followRequestDueDate` moves the request's **open / in-progress** task(s) through the ordinary audited `update`; a done or cancelled task is untouched. |
| Duplicate removed | `tasks/domain/working-days.ts` and its public export are **deleted**. `@hr/dates` is the only working-day implementation, and its tests cover the old test's Thu → Sun case and more. `tasks.e2e-spec` keeps its create/list tests. |

## Tests

`test/request-task-due.e2e-spec.ts`: **6/6**:
1. Staff path, GRO service (5 working days, not the old 3): task due = request due.
2. Client path in a **Mon–Fri** company: task due = request due.
3. Employee path: the system's date after the raise, and the task has it.
4. A hand edit later, then **earlier**, then **cleared**: the task follows each time.
5. The pause ends **by the requester's reply** and **by staff moving it on**: the request's date moved, and the task with it.
6. A **finished** task is left alone when the request's date changes.

**Red proofs** (each removed, its tests went red, restored, byte-identical):

| Removed | Tests that went red |
|---|---|
| tasks ignore the request's date | the 3 creation tests |
| the employee path publishes the undated row | the employee test |
| tasks don't follow | the 2 follow tests |
| the reply's pause isn't announced | the pause test |
| finished tasks move too | the finished-task test |

**A case dropped honestly:** I first wrote "the client manager's edit moves it too". It got a **403**, which is right: client managers hold no `request.update` in the v1.7 matrix (create + read only). The test was wrong, not the code.

**Full API suite: 663/663** (658 + 6 new − 1 working-day test that moved to `@hr/dates`). `@hr/api` lint + typecheck green.

## Live (local, running app + DB)

Monday 5 Oct:
- Client manager A raised a **GRO service** request: due **12 Oct** (5 working days, Sun–Thu), `serviceLevelDays: 5`.
- The spawned task was created due **12 Oct** (audit: task `create`, due 2026-10-12).
- HR moved the request to 19 Oct: **the task followed to 19 Oct** (audit: task `update` 2026-10-12 → 2026-10-19).

No web change: the queue and calendar read these dates as before.

Cleanup: the verification request, its task and notifications deleted.
