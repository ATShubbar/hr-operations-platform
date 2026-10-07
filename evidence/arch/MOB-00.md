# MOB-00 — Onboarding and final exit into the architecture (ADR-018, architecture.md v1.12) — Evidence

- Date: 2026-10-07
- Status: **done**. Documentation only: no code, nothing deployed.

## Owner decisions (asked; answers recorded)

| Question | Answer |
|---|---|
| How should onboarding connect to the Hiring board's "Visa & mobilisation" column? | **The column becomes real** (recommended). Offer → Visa & mobilisation creates the employee and starts onboarding; filing the last step moves the candidate to Onboarded. |
| What does filing a step do with its government fee? | **Shown only, recorded later** (recommended), by the Billing epic. |
| What does finishing a final exit do to the record? | **Terminate on departure** (recommended). |
| Who sees a running sequence? | **Staff only** (recommended). |
| The MOB-00 card, including my stated choices (GRO owns it, fixed step lists, employment status `onboarding`, Saudi skip, withdraw cancels and terminates, events, not in queue/calendar) | **approved** |

## What the research found first

- **Prototype** (`design/…/People & Gro Console.dc.html`):
  - `RUNBOOKS` holds two fixed step lists: onboarding (11) and exit (8). Each step has a portal, a target day, `needs` (what it waits on), a standard fee and a note.
  - The runtime derives each step's state: `filed`, `ready`, or `blocked` with "Waiting on …".
  - `undoStep` refuses while a filed later step depends on the step ("Reopen … first — it was filed on the back of this one").
  - `startRunbook` refuses a second running sequence of the same kind for a person.
  - `completeStep` records a fee to a ledger and accepts a receipt. That is the part deferred to Billing.
  - It renders the Person record's **Mobilisation** tab; a staff Overview panel and a Reports panel, both "Mobilisations and exits"; and the Hiring stage `Visa & mobilisation`.
  - The tab is hidden for client and employee views (`isMobTab: … && !r.client`; `mobEmpty` true for client/employee).
  - Seeds 3 sequences (two onboardings mid-flight, one exit), on non-Saudi staff only.
- **Architecture:** no mention of mobilisation, onboarding, sequences or final exit. BACKLOG lists "mobility sequences" among prototype features needing an amendment first.
- **App:**
  - the Mobilisation tab is "coming soon" (DS-06);
  - the board column is "coming soon" and never a drop target (DS-09);
  - `GroProcessType` already has `final_exit` as a SINGLE procedure;
  - `EmploymentStatus` is active / on_leave / suspended / terminated;
  - REC-05 creates an `active` employee at `hired`.
- **Readers of `employmentStatus`**, which a new status reaches: **21 files**, listed in the consequences for MOB-04:
  - API: employees controller/service/view, the candidate-hired handler, leave (3 services), reporting, self-service controller and accounts service;
  - web: client record + client figures, Person record + profile tab, client overview, portal employees;
  - contracts: employee, headcount (+test), self-service, index.
- **Readers of the candidate stage `offer`**: the stage workflow, vacancies pipeline counts, the reporting service, the web `hiring/stages.ts` and contracts `candidate.ts`.

## What changed

| File | Change |
|---|---|
| `adr/ADR-018-onboarding-final-exit.md` | NEW. Context, options (procedures with dependencies / a checklist on the record / sequences: chosen), shape and ownership, step rules, fees, who, Hiring link, final exit, events, where it appears, out of scope, consequences, build. |
| `architecture.md` | **v1.12** + changelog; module 6 (GRO) now names sequences. |
| `adr/README.md` | ADR-018 indexed. |
| `BACKLOG.md` | MOB-00 (done), MOB-01..05 (planned). |
| `CLAUDE.md` | Map (v1.12, ADR-001..018) + state. |
