# ADR-013 — Six built-in roles, from the People & Gro prototype

- Status: Accepted
- Date: 2026-10-03
- Owner: Ahmed Alshubbar (product decision)
- Amends: **ADR-002 (Authorization)** — the role set and the seed permission matrix
  (architecture.md "Roles" + "Permission matrix", now v1.7). The authorization MODEL is
  unchanged: permission-based RBAC, `resource.action` permissions, deny by default, field-level
  authorization, the catalog in code authoritative.

## Context
The platform has carried ten roles since v1.2: System Admin, Company Admin, Recruiter, HR
Officer, GRO Officer, Finance, Read Only, Client Admin, Client User, and (ADR-011) Employee.

The owner's console prototype (`design/People & Gro console design (1)/People & Gro
Console.dc.html`, ADR-012) is built on fewer roles:
- `ROLES` (the people the prototype shows):
  - Administrator
  - HR officer
  - GRO officer
  - Client manager
  - Employee
- `ROLE_DEFS` and `PERM_DEFAULT` (its Roles and permissions screen) add an **Auditor**: "reads
  everything, changes nothing".

The prototype states permissions as Read / Write / Create / Delete over nine resources:
employee records, government procedures, documents and expiries, employee requests, payroll
and compensation, the hiring pipeline, client companies, the scheduling calendar, and the
audit log.

The owner decided (2026-10-03, round 2) to **move to the prototype's roles before the screens
are rebuilt**. On the four points the prototype does not settle, the owner chose:
1. **Auditor is a built-in sixth role.**
2. **Recruiter accounts become HR officer.**
3. **Finance accounts become HR officer.**
4. **Only Administrators manage client portal users.** The prototype gives client managers no
   user management.

## Options considered
1. **Keep ten roles; restyle only.** Least change, but the prototype's Roles screen, role
   labels and screen gating would have no counterpart. Declined by the owner.
2. **Map onto the prototype's roles (six with Auditor).** Chosen.
3. **Go straight to editable roles.** This is the prototype's Roles screen editing
   `PERM_DEFAULT` live. Deferred by the owner to the LAST feature epic, with safeguards:
   fixed bundles first.

## Decision

### The roles and where today's accounts go

| Role | Who | From today's roles |
|---|---|---|
| **Administrator** | Consultancy leadership; full control including pay, access and system configuration | System Admin, Company Admin |
| **HR officer** | Runs people files end to end, including pay, contracts and hiring | HR Officer, **Recruiter**, **Finance** |
| **GRO officer** | Government portals and procedures; no pay | GRO Officer |
| **Auditor** | Reads everything, changes nothing | Read Only |
| **Client manager** | One client company; mostly read; no government identifier numbers | Client Admin, Client User |
| **Employee** | Their own record (ADR-011) | Employee (unchanged) |

### Rules this ADR fixes
- **The prototype contradicts itself on Reports and the Audit trail, and the narrower reading
  wins.**
  - `PERM_DEFAULT` gives HR and GRO officers audit-log Read.
  - The prototype's navigation shows *Reports* and *Audit trail* to the Administrator ONLY
    (`adminOnly`).
  - Deny by default resolves the conflict: Reports and the audit log are Administrator +
    Auditor. The Auditor is not in the prototype's navigation model, but reading the audit log
    is the role's purpose.
- **Category scoping on documents is kept for the GRO officer** (government documents only).
  The prototype does not model document categories; dropping the scope would widen access with
  no decision behind it.
- **Client managers see vacancies, not candidates.** The prototype's `hiring: R` for clients is
  read as their company's open positions. A candidate's CV and PII remain consultancy data
  (REC-03).
- **Two-factor sign-in is required for Administrator AND Auditor.** Today it applies to System
  Admin and Company Admin. An Auditor reads every salary and the full audit log, which is as
  sensitive as any administrator seat.
- **No role is a default.** Today `auth_users.role` defaults to `read_only`. Its successor,
  Auditor, reads pay, so a defaulted account would be the most dangerous mistake possible.
  Every account must be created with an explicit role.
- **Bulk export stays separate from reading.** `report.export` goes to Administrator only;
  Auditor reads reports but does not export them (REP-03: passive access ≠ bulk extraction).
- **Self-protection is unchanged.** An Administrator cannot disable or demote their own account
  (UX-10b).
- **`staff-user.directory` stays in every staff role** (UX-10b): name and role of colleagues
  only.

### What changes for each existing account

Widenings (each a consequence of following the prototype):
- **Recruiter → HR officer:**
  - gains pay (read + update);
  - gains government data (read + update);
  - gains all document categories;
  - gains request processing;
  - loses recruitment delete.
- **Finance → HR officer:**
  - gains full employee records (create/update);
  - gains government data;
  - gains documents;
  - gains hiring (create/update);
  - gains GRO procedures and request processing.
- **HR officer:**
  - gains hiring create/update;
  - gains GRO procedures (create/update);
  - gains government-data update;
  - gains request delete;
  - gains calendar delete + read-all.
- **GRO officer:**
  - gains hiring read/update (previously excluded from recruitment);
  - gains calendar delete + read-all.
- **System Admin → Administrator:** gains everything Company Admin had (employee, request and
  task writes, recruitment, GRO, calendar, salary update) plus client portal user management.
- **Company Admin → Administrator:** gains system configuration and staff-user management.
- **Read Only → Auditor:** gains pay read, the audit log and staff users (read).

Narrowings:
- **HR officer:**
  - loses employee delete (the prototype's HR is `RWC` on employee records);
  - **loses Reports**.
- **GRO officer:**
  - loses core-profile update (the prototype gives `employees: R`; government data stays
    writable through procedures);
  - loses document delete (`RWC`);
  - **loses Reports**.
- **Client Admin → Client manager:**
  - loses portal-user management (to Administrators);
  - loses request update (the prototype's client is `RC`);
  - loses document upload (the prototype's client is documents `R`).

### Sequencing (no gap in who can do what)
1. **ROLE-02** — a STAFF path for client portal users: an Administrator manages any client's
   portal accounts. This is additive, and the client path still works.
2. **ROLE-03** — the migration:
   - role enum and accounts;
   - permission bundles;
   - MFA set;
   - no default role;
   - seed accounts;
   - tests and the isolation harness;
   - web labels;
   - removing the client's *Portal users* screen.

   Client managers lose `client-user.*` only after Administrators can already do it.

## Consequences
- architecture.md v1.7 replaces the "Roles" list and the permission matrix.
- The permission CATALOG barely changes; what changes is which bundle holds which permissions.
- The isolation harness and every role-pinned test move in ROLE-03. The principal fence and
  `scopeOf` are untouched: principal types (staff / client_rep / employee) do not change.
- There is **no production data**. Staging never held real data and nothing is provisioned on
  GCP, so the account migration touches seed and dev accounts only.
- Reports become an Administrator + Auditor surface. HR and GRO officers keep their working
  views (Overview, Work queue, Expiry). The matrix's unbuilt "Client Admin R (own summary)"
  report is dropped with Client Admin.
- **Reversal:** the old bundles are in git history (`permissions.ts` at `8d13db0`). The
  narrowings are the costly part to reverse, because they are what an auditor of this system
  would rely on.

## Links
- ADR-002 (authorization) — amended here on roles and the seed matrix
- ADR-011 (employee self-service) — the Employee role, unchanged
- ADR-012 (prototype fidelity) — why the prototype is the reference
- `design/…/People & Gro Console.dc.html` — `ROLES`, `ROLE_DEFS`, `PERM_DEFAULT`, `navDefs`
- `BACKLOG.md` → ROLE-01..03; `evidence/arch/ROLE-01.md`
