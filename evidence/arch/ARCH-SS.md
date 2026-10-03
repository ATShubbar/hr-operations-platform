# ARCH-SS — Employee self-service: the architecture amendment — Evidence

- Date: 2026-10-03
- Task card: `BACKLOG.md` → ARCH-SS
- Status: done
- Commit: `ARCH-SS: employee self-service enters the architecture (ADR-011, v1.5)`
- Scope: **documents only.** No code, no migration, no API or web change — the build is the
  SS epic (SS-01..07), each card approval-gated.

## Why this needed an amendment, not a card

`architecture.md` v1.1–v1.4, line 44: *"Out of scope (v1 and current roadmap): employee
self-service. Employees are managed records, not users."* The owner reversed that on
2026-10-03 (DS epic decision 3). The frozen contract says changes go through an ADR, so
this card writes the ADR and amends the contract; nothing is built under it.

## Owner decisions (2026-10-03, all four recommended options chosen)

| Question | Decision |
|---|---|
| How do employees sign in? | **Email + password**, existing login page |
| Who creates accounts? | **Consultancy staff invite** (HR Officer / Company Admin) |
| What do they see about themselves? | **Everything the prototype shows** — profile, available documents, government identifiers *including numbers*, pay; read-only |
| Do client reps see employee-raised requests? | **Yes** — requests stay client-scoped |

Written in as card defaults (stated in the card, not contested): per-client opt-in flag
(default off); isolation to one employee record with RLS on `app.employee_id`; read-only
apart from raising requests; same login page, landing on "Me"; out of scope: leave,
dependants, self-editing, phone sign-in, languages beyond ar/en.

## What changed

| File | Change |
|---|---|
| `adr/ADR-011-employee-self-service.md` (new) | The decision: `employee` principal + `employee_id` binding (client DERIVED at sign-in, so a sponsorship transfer follows the record); staff invitation; email+password, MFA optional; `flag.employee-self-service` per client, default off; isolation to one record (app scoping + RLS on `app.employee_id`, NOT the company-wide client policies) + a same-client "other employee" CI probe; read scope; `employee` role + `employee-user.{invite,read,update}`; a whitelisted self view (the `employee-view.ts` pattern); `modules/self-service` as a delivery module; consequences (password reset + real email are prerequisites, no-email employees excluded, the ar/en language gap, three field-sensitivity tiers). |
| `architecture.md` → **v1.5** | Version + changelog; isolation section (employees bullet, RLS + harness wording); "Users & Authorization" scope rewritten with the history kept; roles table + **Employee**; identity bullet → three principal types; catalog row `employee-user`; permission matrix **+ "Employee (self)" column + "Employee self-service accounts" row**; Business Modules + "Employee Self-Service — Me" (Reporting/Billing renumbered); roadmap row 11; AI master prompt isolation rule. |
| `adr/ADR-002-authorization-model.md` | "Amended by ADR-011" note; its out-of-scope sentence marked historical. Model unchanged. |
| `adr/README.md` | ADR-011 in the index. |
| `ACTION-PLAN.md` | "Explicitly deferred" entry struck through, pointing at ADR-011 + the SS epic. |
| `BACKLOG.md` | ARCH-SS done + card; **SS epic** SS-01..07 (planned). |
| `CLAUDE.md` | Map (v1.5, ADR-011) + state paragraph. |

## One design correction made while writing

The first draft had **Auth** react to the employee-terminated event. Auth is a foundation
module; subscribing to an Employees event would make it depend on a domain module. Changed
so the **self-service module** (top of the graph, imported by nothing) reacts and calls
Auth's public API — the same direction every existing ADR-004 flow takes. The invitation is
orchestrated the same way (self-service checks Employees + Configuration, then asks Auth to
create the account).

## Consistency checks

```
$ grep -c "Employee (self)" architecture.md
2                                  # the v1.5 changelog entry + the matrix header

$ # every permission-matrix row has the new column (11 cells = label + 10 roles)
$ grep -n "^| Capability / data" -A19 architecture.md | awk -F'|' 'NF!=13{print}'
122-                               # only the two lines AFTER the table
123-## Tech Stack

$ # nothing still claims self-service is out of scope, except marked history
$ grep -rn -i "self-service\|managed records, not users" --include='*.md' . | grep -iv "client-self-service"
architecture.md:12  v1.1 changelog entry            (history — changelogs are not rewritten)
architecture.md:47  "History: v1.1–v1.4 excluded…"  (explicitly historical)
ADR-002 Context                                       (marked historical by the amendment note)
ACTION-PLAN.md:133  struck through → ADR-011
ARCHITECTURE-REVIEW.md:57,190                         (the 2026-07 review that RAISED the question — a historical record, left as written)
CLAUDE.md / BACKLOG.md / evidence                      (the decision trail)
```

The isolation harness already has a scope class named **`self`** (CONF-03: per-user
endpoints such as one's own settings). The employee probe must therefore use a DIFFERENT
name (`employee`) in SS-02 — recorded on that card so the two are not conflated.

## Risks carried into the SS epic

- **SS-06 is blocked for production on a real email transport** (dev capture works locally):
  invitations and password reset both send email. A self-service population without
  password reset is not viable.
- **Employees without email** cannot use self-service in this version (phone sign-in =
  future ADR with an SMS vendor and an in-Kingdom review).
- **Language gap:** ar/en only; much of the expatriate workforce reads neither comfortably.
  Recorded in ADR-011 as a known gap; an ADR-005 revision would be the fix.
- **Phone-first:** employees will mostly use phones — SS-07 is designed at 375px first.
