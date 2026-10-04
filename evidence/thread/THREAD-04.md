# THREAD-04 — Service level per request type — Evidence

- Date: 2026-10-04
- Card: `BACKLOG.md` → THREAD-04. Decision record: **ADR-016**, now **rev. 3**; the architecture.md v1.10 line points to it. Status: **done**. **The request-thread epic (THREAD-00..04) is complete.**

## Owner decisions

| Question | Answer |
|---|---|
| Working days per type? | **Letter 2 · Certificate 2 · Document 3 · GRO service 5 · General 1** (recommended; mapped from the prototype's `REQ_SLA`). |
| Editable without a code change? | **Yes, in Settings → System** (recommended): Administrator, audited. |
| Existing open requests? | **New requests only** (recommended). Requests already raised keep their dates. |

## What was built

| Piece | What |
|---|---|
| `@hr/dates` `working-days.ts` | `addWorkingDays(day, n, week)`, counted from the NEXT working day (Thu + 1 → Sun); `workingDaysBetween(from, to, week)` for the pause; `dayIn(instant, tz)`, today's calendar day in a zone. Pure; days are UTC midnight. |
| Setting `request.service-level-days` | Catalog entry, system level. Strict schema: every type, an integer 1–60, nothing extra. Defaults as decided. Exported from the configuration public API. |
| Migration `20261004210000_request_info_needed_since` | `info_needed_since` plus a CHECK: present ⇔ `info_needed`. Rows already waiting start their pause at migration time. `app_employee` gets UPDATE on that one column so their reply can clear it; **still no `due_date`**. |
| `ServiceLevelService` (Requests) | `days()` reads the setting. `dueFor(type, client)` uses the company's own `working.week` (client → system) and the system `timezone`. `dueAfterPause(…)` is null when there's no due date or no working day waited. `recordPause` audits `service-level-paused` (before/after due + paused days). `extendAfterReturn` is a conditional update on the **staff** connection. `setInitialDue` (employee path) is audited `service-level-set`. Failures after a reply are logged, not raised: the reply itself was accepted. |
| Creation | Staff + client paths: no due date given → the type's service level, set in the insert. Employee path: SS-05's `employee_raise` still forbids an employee choosing one, so **the system sets it right after the raise commits**, before the `RequestCreated` event. |
| The pause | **Asking** stamps `infoNeededSince`. **A staff hand-exit** (`process` out of `info_needed`) extends the due date in the same transaction and audits it. **A requester's reply** (comment, or a file that passed its checks) returns the request in the reply's transaction (THREAD-03), then extends the due date after the commit, on the staff connection: neither the client nor the employee role ever writes a due date. |
| Responses | `serviceLevelDays` on the staff/client response and on the employee's own whitelist, the type's CURRENT value. **SS-05's pinned whitelist changed deliberately** (one key added; the due date itself stays staff triage). |
| Web | **Request detail** (staff/client): under the due date, "Service level 2 working days", or "Service level paused while waiting on the requester" while `info_needed`. **`/me/requests`:** the same line. **Settings → System → Service levels** (`settings/service-levels.tsx`, `config.write`): five labelled number inputs; Save is disabled until something changes and while invalid ("Each type needs a whole number of days from 1 to 60."); the panel says requests already raised keep their dates and public holidays aren't counted out yet. Arabic plurals for 1/2/3–10/11+. |
| Reports | The dashboard's service-level panel already measures requests awaiting a decision against their own due date, so it needs no change; a paused (`info_needed`) request is outside it by construction. |
| UAT smoke | The client manager's request must come back with a due date and `serviceLevelDays`. |

## Tests

**`@hr/dates` `working-days.test.ts` — 11 new** (28/28 in the package):
- Sun + 2 → Tue; Thu + 1 → Sun and Thu + 2 → Mon.
- Raised Fri/Sat → counted from Sunday; across two weekends; n = 0 → same day.
- A Mon–Fri week; an empty week or a negative count refused.
- The pause: Sun→Tue = 2; Thu→Sun = 1; Thu→Sat = 0; same or earlier day = 0.
- `dayIn`: 22:30 UTC on 4 Oct is 5 Oct in Riyadh.

**`test/request-service-level.e2e-spec.ts` — 13/13:**
- **Creation:**
  - staff letter → 2 working days, general → 1, `serviceLevelDays: 2`;
  - a hand-set date wins;
  - client path in **Sun–Thu vs a company with a Mon–Fri `working.week` override**;
  - employee path set by the system;
  - the Administrator's PATCH: 0 → 400, a missing type → 400, letter 7 → new requests get 7 days, `serviceLevelDays: 7`.
- **The pause:**
  - asking stamps the start;
  - **a reply after a 9-day wait moves the due date by exactly the working days waited**, audited `service-level-paused` with the count;
  - the same for a staff hand-exit, and in a Mon–Fri company;
  - no due date stays none; a same-day wait pauses nothing;
  - finishing a request never touches its date;
  - the CHECK refuses `info_needed` without a start, and a start without `info_needed`.

**Red proofs** (each removed, its tests went red, restored, byte-identical):

| Removed | Tests that went red |
|---|---|
| creation ignores the service level | 3 |
| the pause computes nothing | 3 |
| the employee path sets nothing | 1 |
| the company's own week ignored | 2 |
| the `info_needed_since` CHECK dropped | the DB test |

**Specs updated deliberately:**
- THREAD-03's database-fence fixtures now carry `infoNeededSince` (the new CHECK). Each test still fails for its original reason.
- SS-05's "untouched by me on every staff field" now asserts the due date is **the system's**: set, with a `service-level-set` audit entry, while the employee still can't choose one.

**Full API suite: 645/645** (632 + 13); `@hr/dates` 28/28. Lint + typecheck across `@hr/api`, `@hr/web`, `@hr/contracts` and `@hr/dates`: 11/11 tasks green.

## Live (local, browser)

- **Client manager A raised a letter** on Sunday 4 Oct: due **6 Oct 2026** with "Service level 2 working days" on the detail.
- **HR asked for detail:** the line became "Service level paused while waiting on the requester".
- The wait's start was backdated by SQL to Thursday 1 Oct, leaving 1 paused working day (Sunday). **The client manager replied with the keyboard:** in place, due **6 → 7 Oct** and the line back to "Service level 2 working days".
- **Settings → System as the Administrator** (seed account, authenticator enrolled temporarily for this check and cleared by SQL afterwards: 0 of 10 enrolled):
  - the Service levels card showed 2/2/3/5/1 with Save disabled;
  - Letter set to 3 by keyboard → saved, the DB holds the new object, the audit row is `system-set` with the full value;
  - General set to 0 → the hint turned to the error text and Save disabled.
- **Arabic at 375px:** the Settings section with «خطاب · شهادة · مستند · خدمة حكومية · عام», 0px overflow; the detail reads «مستوى الخدمة 3 أيام عمل», 0px overflow.
- **Smoke step run locally:** "request: due date set from its service level (due 2026-10-06 · 2 working days)". All checks passed.

**Known limitation, stated:** the detail shows the type's **current** setting. In the check above, the request's date was set under 2 days, then the setting changed to 3 and the line read 3. The due date itself does not move with the setting (new requests only, by decision).

**Cleanup:** the setting row deleted (back to the defaults), the Administrator's authenticator secret cleared, the verification request and the smoke run's requests deleted (with comments, tasks and notifications), and the database re-seeded.
