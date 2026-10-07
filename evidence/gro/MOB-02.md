# MOB-02 — The sequences API — Evidence

- Date: 2026-10-07
- Status: **done**. API only; the tab is MOB-03.
- Decision: ADR-018. Card approved by the owner.

## What changed

| File | Change |
|---|---|
| `packages/contracts/src/sequence.ts` (+ index) | `startSequenceSchema` (strict, `kind` only) and `fileSequenceStepSchema` (strict, optional `filedOn` that must be a real `YYYY-MM-DD`). Responses are **strict whitelists**: a run is id / employeeId / kind / status / startedOn / startedBy{name} / completedAt / cancelledAt / steps; a step is key / portal / fee / day / target / state / waitingOn / filedOn / filedBy{name}. **Steps and `waitingOn` are KEYS**, so the web translates; no user ids. |
| `gro/api/sequences.controller.ts` (NEW) | `GET /employees/:id/sequences` (`gro.read`), `POST /employees/:id/sequences` (start, 201), `POST /gro-sequences/:id/steps/:key/file`, `…/reopen`, `POST /gro-sequences/:id/cancel` (all `gro.process`, 200). **Every route asks `scopeOf` for the staff path**, because client managers hold `gro.read`. Malformed or unknown ids give 404; invalid bodies 400; the service's 409s pass through. Names come from `UsersService.displayNames`. |
| `gro/application/sequences.service.ts` | Each step in the view also carries `filedByUserId`, so the controller can name who filed it. |
| `gro/gro.module.ts` | Controller registered. |
| `test/isolation/endpoint-registry.ts` | The 5 routes as `staff`. |
| `test/audit/audited-writes.ts` | 4 writes: `gro-sequence.start/file-step/reopen-step/cancel`. The severity spec confirms each has a deliberate grade (routine). |

## Tests: `test/gro-sequences-api.e2e-spec.ts`, 7/7

- **Roles:** the GRO officer starts (201); the HR officer files (200); the Administrator reopens (200); the Auditor lists.
  - Run and step keys are asserted **exactly**.
  - Clearance is `blocked` with `waitingOn: ['notice']`.
  - `startedBy` / `filedBy` carry a name.
  - After reopen: `filedOn` and `filedBy` are both null.
- **409s pass through:** a duplicate start, filing a blocked step, reopening with a filed dependent, cancelling twice, filing on a cancelled run.
- **Validation:**
  - **400:** an unknown kind; an extra field on start; an unreal filing date; an extra field on file; an unknown step.
  - **404:** an unknown or malformed employee on start and list; an unknown or malformed sequence on file and cancel.
- **The Auditor:** reads; start, file, reopen and cancel all give 403.
- **A real client manager** (company X, holding `gro.read` through the v1.7 bundle) gets **403 on the read and on every write**, for their own company's people.
- **An employee** gets 403 on everything, about themselves too.
- **Audit:** the trail against the employee is exactly `start, file-step, reopen-step, file-step, file-step, cancel`.

## Red proofs (each broken, its test fails, then restored byte-identical)

| Broken | Failed |
|---|---|
| The staff-only check skipped | **the client-manager test**: the read returned 200. The permission alone does not keep them out. |
| `startedByUserId` added to the response | the exact-keys test (plus the audit-trail test, which cascades because the first test aborts early) |
| `waitingOn` sent as the engine's English titles | the exact-content test (+ the same cascade) |

**One proof needed redoing:** the first attempt at the whitelist proof inserted a literal `\n` through the shell. That broke the file's syntax and the run reported "no tests", which proves nothing. It was redone with a real edit, and the table records that run.

## Gates

- **Full API suite 722/722, twice.**
- Contracts 9/9; api `typecheck` + `lint` clean; web `typecheck` clean against the new contracts.
- Re-seeded.

## Live (dev API restarted; seed data)

| Call | Result |
|---|---|
| GRO officer starts onboarding for Syed Ali | **201**: 11 steps; block-visa `ready`, fee 2000, Qiwa, target today; visa-auth `blocked`, `waitingOn: ["block-visa"]`; `startedBy: {name: "Turki Al-Harbi"}`. |
| Files block-visa | **200**: `filed`, today, `filedBy: {name: "Turki Al-Harbi"}`. |
| Cancels it | **200**, `status: cancelled` (the dev data is left with a finished run, not a running one). |
| Client manager A (Syed Ali's own company) `GET /employees/<Syed>/sequences` | **403** |
