# ROLE-01 — Six built-in roles from the prototype (ADR-013) — Evidence

- Date: 2026-10-03
- Task card: `BACKLOG.md` → ROLE-01
- Status: done
- Commit: `ROLE-01: six built-in roles from the People & Gro prototype (ADR-013, v1.7)`
- Scope: **decision records only** — `adr/`, `architecture.md`, `BACKLOG.md`. 0 files under
  `apps/` or `packages/`.

## Owner decisions

| Date | Decision |
|---|---|
| 2026-10-03, round 2 | Move to the prototype's roles, before the screens |
| 2026-10-03, this card | **Auditor** is a 6th built-in role; today's Read Only accounts go there |
| 2026-10-03, this card | **Recruiter** accounts become HR officer |
| 2026-10-03, this card | **Finance** accounts become HR officer |
| 2026-10-03, this card | **Client portal users** are managed by Administrators only |

All four options in this card were the recommended ones.

## Source, read in the repo (not recalled)

`design/People & Gro console design (1)/People & Gro Console.dc.html`:

- **`ROLES`** (line 4216): the prototype's demo personas, with scope lines.

  | Role | Scope line |
  |---|---|
  | Administrator | "Everything, including pay" |
  | HR officer | "All clients · pay and contracts" |
  | GRO officer | "All clients · government files only" |
  | Client manager | "… only · no identifiers" |
  | Employee | "Your own file and your own requests" |

- **`ROLE_DEFS`**: the same staff roles plus **Auditor**, "Reads everything, changes nothing".
- **`RESOURCES`** × **`ACTIONS`**: 9 resources × Read / Write / Create / Delete.
- **`PERM_DEFAULT`**: the permission letters per role. These are the source of the v1.7
  matrix.

  | Resource | Admin | HR | GRO | Client | Auditor |
  |---|---|---|---|---|---|
  | employees | RWCD | RWC | R | R | R |
  | procedures | RWCD | RWC | RWCD | R | R |
  | documents | RWCD | RWCD | RWC | R | R |
  | requests | RWCD | RWCD | RW | RC | R |
  | payroll | RWCD | RW | – | – | R |
  | hiring | RWCD | RWC | RW | R | R |
  | clients | RWCD | R | R | – | R |
  | calendar | RWCD | RWCD | RWCD | – | R |
  | audit | RWCD | R | R | – | R |

- **`navDefs`** (line 5539) gates screens differently from `PERM_DEFAULT`:
  - `roles`, `reports` and `audit` are `adminOnly`;
  - client managers lose `clients`, `calendar` and `queue`;
  - employees get `me`, `requests` and `leaves` only.

## The contradiction this card had to resolve

`PERM_DEFAULT` gives HR and GRO officers **audit R**. `navDefs` shows *Audit trail* and
*Reports* to the **Administrator only**.

The prototype therefore disagrees with itself. ADR-013 takes the **narrower** reading, as deny
by default requires: Reports and Audit logs belong to Administrator + Auditor.

Recorded consequence: HR and GRO officers **lose Reports**, which every staff role reads today.

## What the ADR adds beyond the prototype (each stated as such)

- **MFA for Auditor** as well as Administrator. The Auditor reads every salary.
- **No default role.** Today `auth_users.role @default(read_only)` (schema line 22). Its
  successor, Auditor, reads pay, so a defaulted account would silently see everyone's salary.
- **Kept narrower than the prototype:**
  - GRO documents stay government-category-scoped.
  - Client managers see vacancies, not candidates (REC-03: candidate PII is consultancy data).
  - Auditor reads reports but does not export them (REP-03).

## Today's grants, read from code before writing the mapping

`apps/api/src/modules/auth/domain/permissions.ts` (`ROLE_PERMISSIONS`, `ALL_CLIENT`,
`CLIENT_ADMIN`) and `auth.controller.ts:50` (`MFA_REQUIRED_ROLES = system_admin,
company_admin`). Facts that shaped the ADR:

- **Client portal users have no staff path.** `client-users.controller.ts` derives the client
  from the CALLER's context ("staff have no client scope, so they are rejected here too").
  Moving `client-user.*` to Administrators therefore needs new code.
- **That forces the order:**
  1. **ROLE-02** — the staff path (additive).
  2. **ROLE-03** — the migration.

  This leaves no window in which nobody can manage portal accounts.
- **63 files** under `apps/` and `packages/` mention a legacy role name, measured with a `grep`
  for the seven retired role names. This sizes ROLE-03.

## What changed

| File | Change |
|---|---|
| `adr/ADR-013-six-role-model.md` (new) | Context, options, the six roles + account mapping, the fixed rules, **every widening and narrowing per existing role**, the ROLE-02 → ROLE-03 sequencing, consequences, reversal |
| `adr/ADR-002-authorization-model.md` | "Amended by ADR-013" — role set changes, the model does not |
| `adr/README.md` | ADR-013 row |
| `architecture.md` | **v1.7**: changelog; *Roles* table → six roles; MFA rule (Administrator + Auditor, no default role); **permission matrix → 6 columns** (17 rows, every row 7 cells, checked with `awk`); three prose references to retired roles updated (client isolation, configuration levels) |
| `BACKLOG.md` | ROLE-01 done; **ROLE-02** (staff path for portal users) and **ROLE-03** (the migration) rows + cards; DS-05+ now depends on ROLE-03 |

## Not done here (by design)

**No code.** Today's ten roles still run the system until ROLE-03.
