# ADR-018 — Onboarding and final exit: ordered sequences of government steps

- Status: Accepted
- Date: 2026-10-07
- Owner: Ahmed Alshubbar (product decision; MOB-00)
- Amends: **architecture.md**:
  - the GRO module's description;
  - the employment statuses (adds `onboarding`);
  - the candidate stages (adds `mobilisation`).
  
  Now **v1.12**.

## Context

Bringing an expatriate into the Kingdom, and seeing them out, are the largest pieces of GRO work. Neither is a single procedure: each is a chain of portal steps where one cannot be filed before another.

The prototype calls them **runbooks**: "a mobilisation or an exit is a sequence, not a pile of unrelated tasks. Each step names what it waits on, so a stuck file can say why." It shows them in three places:
- the Person record's **Mobilisation** tab (start, progress, Mark filed, Reopen);
- a **Mobilisations and exits** panel on the Overview and on Reports;
- the Hiring board's **Visa & mobilisation** column, between Offer and Onboarded.

The app has none of this:
- the tab is "coming soon" (DS-06);
- the board column is "coming soon" and never a drop target (DS-09);
- GRO processes (GRO-01..05) are single procedures with no order between them;
- hiring a candidate creates an `active` employee immediately (REC-05).

## Options considered

1. **Model each step as a GRO process with dependencies.** Reuses the procedure table, but a procedure is a status workflow with its own life (assignee, rejection, retry). An onboarding would become 11 procedures that know nothing of each other's order, which is the "pile of unrelated tasks" the prototype rejects.
2. **A checklist on the employee record.** Simple, but it can't hold more than one run (a rehire, or an exit after an onboarding), and it has no history.
3. **Sequences as their own records, owned by GRO, with the step lists fixed in code** (chosen).

## Decision (owner decisions marked ★)

### Shape and ownership

- Sequences belong to the **GRO module**: it is government-procedure work, and GRO already operates on Employees (GRO-03).
- **`gro_sequences`**: one row per run.
  - Fields: employee, company (for reporting), kind (`onboarding` | `final_exit`), started on, status `running` → `completed` | `cancelled`, who started it.
  - **At most one running sequence per employee per kind** (partial unique index).
- **`gro_sequence_steps`**: one row per step of a run, with its key, when it was filed and by whom.
- **The step lists are fixed in code**: the prototype's runbooks, unchanged. Each step carries a title, portal, note, standard fee, target day (from the start) and the steps it waits on.
  - **Onboarding**, 11 steps. *From block visa to first payroll.*
    1. Block visa requested (Qiwa)
    2. Visa authorisation issued (MOFA)
    3. GAMCA medical cleared
    4. Visa stamped (Enjaz)
    5. Ticket booked and arrival logged
    6. Medical inside the Kingdom (Seha)
    7. Iqama issued (Muqeem)
    8. Medical insurance activated (CCHI)
    9. GOSI registration filed
    10. Contract authenticated (Qiwa)
    11. Salary account and WPS
  - **Final exit**, 8 steps. *From notice to departure and cancellation.*
    1. Notice recorded (Qiwa)
    2. Company clearance and handover
    3. Final settlement calculated
    4. GOSI deregistration
    5. Contract closed on Qiwa
    6. Final exit visa issued (Muqeem)
    7. Repatriation ticket booked
    8. Departure confirmed, iqama cancelled (Muqeem)
  - Editable templates are a later decision.

### Step rules

- A step is **filed**, **ready** (everything it waits on is filed) or **blocked** ("Waiting on …").
- Only a ready step can be filed.
- A filed step can be **reopened only while no filed step depends on it**: reopen the later one first.
- ★ *(MOB-04b, rev. 1)* **A completed sequence is final: neither kind can be reopened.** MOB-01
  had followed the prototype and let a completed onboarding reopen. Its completion now makes the
  person active and their candidate Onboarded, which a reopen would not undo. A mistake is
  corrected by starting a new sequence by hand.
- Every start, file, reopen, completion and cancellation is audited (resource `gro-sequence`, against the employee, so it appears on the Person record's History).
- **Target dates** are the start date plus each step's day, shown in Gregorian and Hijri.
- The run **completes** when its last step is filed.

### Fees ★

- ★ **Shown for information only.** Each step shows the standard government fee.
- Recording what was actually paid against the client waits for the **Billing** epic, as the dependant fee did (ADR-017). Receipts attached to a filed step wait with it.

### Who ★

- ★ **Staff only.**
  - Holders of `gro.process` (Administrator, HR officer, GRO officer) start sequences and file and reopen steps.
  - The **Auditor** reads.
  - **Client managers and employees see nothing**, as in the prototype. Their `gro.read` for status-only procedure views does not extend to sequences: the API asks `scopeOf` for the staff path.
- No new permission: `gro.read` and `gro.process` cover it.

### Onboarding and Hiring ★

- ★ **The board's Visa & mobilisation column becomes real.**
  - New candidate stage **`mobilisation`**, between `offer` and `hired`.
  - Moving a candidate **Offer → Visa & mobilisation** creates their employee record, as hiring does today (REC-05), and starts onboarding for it.
  - **Filing the last onboarding step moves the candidate to Onboarded (`hired`) by itself.**
- **A Saudi national skips the column.** The visa steps don't apply, so Offer → Onboarded stays as today, and Offer → Visa & mobilisation is refused for them.
- ★ *(MOB-04b)* **A non-Saudi at Offer may go either way**: to Visa & mobilisation, or straight to
  Onboarded for someone already in the Kingdom (a local transfer has no visa steps to take).
- ★ *(MOB-04b)* **The hire date is the arrival date**: the date the "Ticket booked and arrival
  logged" step was filed, set when onboarding completes, and only if no hire date is on file.
- Nobody moves a candidate out of Visa & mobilisation by hand, either to Onboarded or back to
  Offer. Only the onboarding's completion, or a withdrawal or rejection, does.
- **New employment status `onboarding`**, for someone mid-mobilisation who has not arrived. They are **not under management**:
  - the shared headcount rule (`isUnderManagement`, REP-06) excludes them;
  - Saudisation and headcount figures leave them out.
  
  Completing onboarding makes them `active`. People and the Person record show them with an "Onboarding" status.
- **Withdrawing a candidate during mobilisation** cancels the sequence and **terminates** the employee record that was created for them. It stays as history and is never deleted.
- **Rejecting during mobilisation** does the same.
- Staff can also **start onboarding by hand** from the Person record, for someone already on file (for example a transfer in). That does not change their employment status.

### Final exit ★

- Started by hand from the Person record.
- ★ **Filing the last step ("Departure confirmed, iqama cancelled") terminates the employee.** The existing `EmployeeTerminatedEvent` then closes their self-service account (SS-06a), and the record stays as history.
- A final exit can be cancelled while running (the employee stays as they were).

### How the modules talk (ADR-004) — rev. 1

*Rev. 1 (MOB-04b, 2026-10-10).* The first version had GRO publish `OnboardingCompletedEvent` for
Employees and Recruitment to subscribe to. That is **not buildable**. Employees already imports
Recruitment (for the hire events) and GRO already imports Employees, so either subscription would
close a loop (GRO → Employees → Recruitment → GRO) that the module loader cannot resolve. The
behaviour is unchanged; the wiring is:

- **Recruitment** publishes **`CandidateMobilisingEvent`** (Offer → Visa & mobilisation). It carries
  the **employee id Recruitment minted** and stored on the candidate (`rec_candidates.employee_id`),
  so no reply is needed.
- **Employees** subscribes, creates the employee as `onboarding` with that id, and publishes
  **`EmployeeMobilisingEvent`**.
- **GRO** subscribes and starts the onboarding sequence.
- When it completes, **GRO calls `EmployeesService` directly**. This is the same call it already
  makes for expiry dates (GRO-03), for the same reason: an event would cycle. The person becomes
  `active`.
- **Employees** publishes **`EmployeeJoinedEvent`** on the transition `onboarding → active`.
- **Recruitment** moves the candidate to `hired`. It subscribes to that event **by name**
  (`employee.joined`), because it cannot import Employees. The name and the one field it reads are
  pinned by a test. This move publishes no hire event, since the employee already exists.
- Withdraw or reject during mobilisation: **Recruitment** publishes
  **`CandidateMobilisationEndedEvent`**; **Employees** terminates the record. The existing
  termination event then cancels the onboarding (GRO, MOB-04a) and closes any account
  (self-service).
- A **final exit's completion** terminates through `EmployeesService.update`, the same direct call.

Each handler is safe to repeat. The bus isolates failures, so a failed later link leaves the
earlier ones standing. A completed onboarding whose person is still `onboarding` is the sign of
that, and it is logged as an error.

### Where sequences appear

- The Person record's **Mobilisation** tab.
- The **Mobilisations and exits** panels on the Overview and Reports.
- The Hiring column.
- **Not in the Work queue or the Calendar for now** (as leave): a ready step is not yet a work item with an assignee. Putting them there is a later card.

### Out of scope

- Recording fees and receipts (Billing).
- Editable step lists.
- Sequences for client managers and employees.
- Steps in the queue or calendar.
- Exit re-entry, sponsorship transfer and other procedures as sequences (they stay single GRO procedures).
- Public-holiday calendars for targets.

## Consequences

- A new employment status reaches every place that reads one: about 20 files across the API, the web app and contracts (headcount, leave balances, self-service, reports, People, the Person record, client figures, portal). MOB-04 lists and handles each before changing the enum.
- A new candidate stage reaches the stage workflow, the board, pipeline counts and the recruitment report.
- Hiring's single event (REC-05) gains a second path. Hire-from-Offer stays exactly as it is.
- Two new staff-owned tables: GRO tables, so `app_client` and `app_employee` get no grants.

## Build

- **MOB-01:** the tables, the pure step engine and an audited service.
- **MOB-02:** the API.
- **MOB-03:** the Person record's Mobilisation tab.
- **MOB-04:** the Hiring column (stage, status, event chain).
- **MOB-05:** final-exit termination, the Overview and Reports panels, and seeded sequences.

## Links

- ADR-004 (domain events)
- ADR-012 (prototype fidelity)
- ADR-013 (roles)
- ADR-017 (fees left to Billing)
- REC-05 (hire creates the employee)
- GRO-03 (GRO writes to Employees)
- REP-06 (the headcount rule)
- SS-06a (termination closes self-service)
