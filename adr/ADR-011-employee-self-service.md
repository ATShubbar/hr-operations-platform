# ADR-011 — Employee self-service

- Status: Accepted
- Date: 2026-10-03
- Owner: Ahmed Alshubbar (product decisions); implementation per `BACKLOG.md` → SS epic
- Amends: `architecture.md` v1.4 → **v1.5** ("Users & Authorization", roles, identity, isolation, permission matrix, business modules)

## Context
`architecture.md` v1.1–v1.4 placed employee self-service explicitly **out of scope**:
"Employees are managed records, not users. The identity model keeps a future
employee-actor possible but nothing is built for it."

The owner's redesign of the console (Claude Design, 2026-10) includes a **"My file"**
screen: the employee's own documents with expiry ("the People & Gro team renews each of
these before it lapses — nothing here needs doing by you"), their identifiers, their pay,
their requests, and a "Raise a request" action. On 2026-10-03 the owner brought employee
self-service **into scope**, sequenced first among the redesign's unbuilt features, and
required it to go through an architecture amendment rather than be built under a visual
card.

This is the largest change to the authorization model since v1.1: a **third kind of
principal**, and the first whose isolation boundary is narrower than a client company.

## Options considered

**Who the user is**
1. **A third principal type, `employee`, bound to exactly one employee record.** Fits the
   v1 identity rule ("one identity system… principal type + binding on the user record").
2. Employees as a kind of client representative. Rejected: a client rep's boundary is the
   whole company; an employee's must be one record. Reusing the client-rep path would make
   the company-wide RLS policies the backstop for a person-scoped user — a missed filter
   would show an employee their colleagues' files.

**How they sign in** (owner chose 1)
1. **Email + password** on the existing login surface and session store.
2. Phone + SMS one-time code — fits a workforce where many people have a phone and no
   email, but needs an SMS vendor, its own ADR and an in-Kingdom data review.
3. Email now, phone later.

**Who creates accounts** (owner chose 1)
1. **Consultancy staff invite** (HR Officer / Company Admin) from the employee's record.
2. The Client Admin invites their own employees.
3. Both.

**What an employee sees about themselves** (owner chose 1)
1. **Everything the prototype shows** — core profile, own available documents, own
   government identifiers *including the numbers*, own pay. Read-only.
2. Without pay.
3. Identifiers as expiry/status only (the client-rep tier).

**Whether client reps see employee-raised requests** (owner chose 1)
1. **Yes** — requests already belong to a client company and reps already see all of
   their company's requests.
2. No — staff and the employee only (needs a visibility column + an RLS change).

## Decision

### Identity
- `auth_users` gains a third principal type, **`employee`**, with an **`employee_id`
  binding** (one account ↔ one employee record; one record has at most one account).
  The account carries **no** stored `client_id`: the client is **derived from the employee
  record at sign-in**, so an employee transferred between client companies (a sponsorship
  transfer) follows the record rather than keeping access to the old company.
- One email = one account. A person cannot hold an employee account and a staff or
  client-rep account on the same email.
- Sign-in is **email + password on the existing login page**; employees land on "Me".
  MFA is **available, not required** (it stays required for System Admin and Company Admin).
- **Accounts are created only by staff invitation** (new capability, see below) from the
  employee's record; the invitee sets their own password from the invitation link. No
  self-signup.
- **Lifecycle follows the record:** when an employee is terminated, their account is
  deactivated and their sessions revoked. Employees publishes the change as an ADR-004
  event and the **self-service module** reacts by calling Auth's public API — *not* Auth
  itself, which is a foundation module and must not depend on a domain module's events.
  Deactivate, never delete (the UX-10b rule: sessions and audit entries reference the id).

### Opt-in per client company
- A per-client feature flag **`flag.employee-self-service`**, default **off**, on the
  existing Configuration substrate (the same mechanism as `flag.client-self-service`).
  When off, invitations cannot be sent for that client's employees and existing employee
  sessions are refused — the employer decides whether its workforce gets access.

### Isolation — the narrowest boundary in the system
- **An employee principal sees exactly one employee's data: their own.** Never a
  colleague's, including colleagues at the same client company.
- Enforced the same two ways as client isolation (ADR-001): **application scoping** in
  every query (the employee id comes from the session, never from the request) **plus
  PostgreSQL RLS as the fail-closed backstop** — employee sessions run with an
  `app.employee_id` setting (set and cleared exactly like `app.client_id`, using the
  `NULLIF(current_setting(...), '')` form from SPIKE-001) under policies that admit only
  rows whose employee id matches. The company-wide client-rep policies are **not** the
  backstop for this principal.
- The CI isolation harness gains an **employee probe**: every employee-facing endpoint is
  called as **another employee at the same client** (the case the client boundary cannot
  catch) and as an employee of another client; any leak is a build failure.

### What employees can do
- **Read**, for their own record only: core profile; government data **including
  identifier numbers** (it is their own data — PDPL gives a data subject a right of
  access); salary and pay; their documents in **`available` state only** (never pending
  or quarantined — the PORTAL-03 rule).
- **Raise and track requests**, scoped to their own client company and recorded as raised
  by them. Client reps **do** see employee-raised requests (they are client-scoped like
  every request); staff process them as today.
- **Notification preferences** for their own account.
- **Nothing else.** No edits to their own record — a change is asked for through a request
  and made by staff, so every change to employee data still has a staff actor in the audit
  trail. No tasks, calendar, reports, GRO workflows, recruitment, or other employees.

### Permissions
- Role **`employee`** in the catalog, holding `employee.read`, `salary.read`,
  `govdata.read`, `document.read`, `request.create`, `request.read`,
  `notification-pref.update`. **Self-scoping is NOT in the names** (the naming convention:
  no `.own` suffix) — it comes from the isolation layer composing with the policy service,
  exactly as client scoping does.
- New capability **`employee-user.invite`** (and `employee-user.read`,
  `employee-user.update` for deactivation/reactivation) granted to **Company Admin** and
  **HR Officer**. A new resource rather than reuse of `client-user.*`, because the
  population, the inviter and the binding all differ.
- The response shape is a **whitelisted self view** in the Employees module (the
  `employee-view.ts` pattern from PORTAL-02), not the staff shape with fields removed —
  a field added to the staff view must not reach employees by default.

### Where it lives
- A **delivery module, `modules/self-service`** ("Me"), the counterpart of the Client
  Portal: no business logic of its own, reads Employees / Documents / Requests through
  their public APIs. Self-service and the client portal stay separate modules because their
  principals and isolation boundaries differ.
- **Auth owns the account** (`auth_users`, as for staff and client users); the employee
  binding is a bare id reference, no foreign key (the cross-module rule). The **invitation
  is orchestrated by self-service**: it checks the employee exists (Employees), that the
  client's flag is on (Configuration), then asks Auth to create the bound, inactive account.
  Self-service sits at the top of the graph and nothing imports it, so no cycle forms.

## Consequences
- **A password-reset flow becomes mandatory.** Staff never needed one (an admin resets
  them); a workforce of self-service users cannot work without it. Both reset and
  invitation delivery depend on a **real email transport**, which is still deferred (dev
  capture only). This is a hard dependency of the invitation card, recorded in BACKLOG.
- **Employees without an email address cannot use self-service** in this version. Phone
  sign-in is a future ADR (SMS vendor + in-Kingdom review), not a quiet addition.
- **Languages:** the product supports Arabic and English (ADR-005). Much of the expatriate
  workforce reads neither comfortably (Urdu, Hindi, Bengali, Tagalog, Malayalam…). This is
  a **known gap**, recorded rather than hidden; adding locales is an ADR-005 revision.
- **Field sensitivity now has three tiers** where it had two: staff (by capability),
  client rep (govdata status-only, no salary), and self (own full record). Every new
  employee field must declare its tier in the self view.
- Two isolation policies apply to some tables (client and employee); each new
  employee-scoped table follows an extended checklist in
  `apps/api/src/modules/README.md`.
- The audit trail gains a new actor type; employee-raised requests are attributable to the
  employee, while every change to employee data remains a staff action.
- Out of scope, unchanged: leave, dependants, editing one's own profile, payslips/documents
  generated by the system, phone sign-in, languages beyond ar/en.

## Links
- `architecture.md` v1.5 — Users & Authorization, Operating Model & Data Isolation,
  Permission matrix, Business Modules
- ADR-001 (isolation — RLS + pooling), ADR-002 (authorization model), ADR-004 (events),
  ADR-005 (localization), SPIKE-001 (GUC form)
- `BACKLOG.md` → ARCH-SS (this decision) and the SS epic (implementation)
- `evidence/arch/ARCH-SS.md`
