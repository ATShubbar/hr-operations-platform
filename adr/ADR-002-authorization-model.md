# ADR-002 — Authorization: permission-based RBAC, deny by default

- Status: Accepted
- Date: 2026-07-18 (rev. 1, same day: permission naming convention formalized as `resource.action`)
- Owner: TBD

## Context
Two user populations — consultancy staff (nine roles) and client-company representatives — with very different scopes, plus field-level sensitivity (salary vs. iqama expiry). Employee self-service is out of scope; employees are records, not users, but the identity model should not make a future employee actor impossible. Authorization mistakes in an HR system are compliance incidents, so the model must be enforceable centrally and testable.

## Options considered
1. **Role checks inline in handlers (`if role === 'RECRUITER'`).** Fast to write, impossible to audit or refactor; scattered logic guarantees drift. Rejected.
2. **Full attribute-based access control (ABAC) / policy engine (e.g., OPA, Casbin).** More expressive than needed for a fixed role set; adds an engine to operate and a policy language to learn.
3. **Permission-based RBAC with a central policy service.** Roles map to named permissions (`employee.read`, `document.upload`); code checks permissions, never roles. Field-level sensitivity modeled as distinct permissions (e.g., `salary.read`).

## Decision
Option 3, with these rules:
- **Naming convention:** every permission is `resource.action` — lowercase, dot-separated (`salary.read`, `employee.update`, `document.upload`). Resources are flat singular nouns; sensitive field groups are promoted to their own resource (`salary`, `govdata`) so their access is independently grantable. Actions come from a fixed verb set (`create`, `read`, `update`, `delete`, `approve`, `process`, `upload`, `export`); new verbs require review. Client scoping is never encoded in the name (no `.own` suffix) — it comes from the actor's client binding composing with ADR-001. The full resource-prefix mapping lives in `architecture.md`.
- **Deny by default**: a NestJS global guard rejects any endpoint without explicit permission metadata. An unguarded endpoint is unreachable, not accidentally public.
- One central policy service, `can(actor, action, resource)`; no inline role conditionals.
- Client representatives carry a client binding on the user record; their permission checks compose with ADR-001 isolation.
- One identity system for staff and client reps (single user store, principal type field); separate login surfaces are a UX concern only.
- MFA available day one; required for System Admin and Company Admin.
- The role-permission matrix in `architecture.md` is the seed; the permission catalog in code is authoritative.

## Consequences
- Adding a capability means declaring its permissions once and mapping them to roles — no handler edits across modules.
- Per-client custom roles are not supported in v1; if a client demands them, that's a new ADR (the permission catalog survives, the role→permission mapping becomes data).
- The deny-by-default guard needs a CI test proving an endpoint that "forgot" its metadata is rejected (walking skeleton DoD 1.3).

## Links
- `architecture.md` — Users & Authorization, permission matrix
- ADR-001 (isolation composes with permissions), `ACTION-PLAN.md` 0.2, 2.2
