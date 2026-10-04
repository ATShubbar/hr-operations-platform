# Architecture Decision Records

One decision per file, numbered in creation order. A record is never edited to change a decision — a new ADR supersedes the old one, and the old one's status is updated to point at it. This keeps the reasoning trail intact.

## Statuses
- **Accepted** — decided; build against it.
- **Proposed** — direction chosen, pending validation (e.g., a spike) before it hardens.
- **Open** — decision point identified, evaluation not finished.
- **Superseded by ADR-0XX** — no longer current; kept for history.

## Index

| # | Title | Status |
|---|---|---|
| [ADR-001](ADR-001-data-isolation-rls-prisma-pooling.md) | Data isolation — client_id + RLS with Prisma and pooling | Accepted |
| [ADR-002](ADR-002-authorization-model.md) | Authorization — permission-based RBAC, deny by default | Accepted |
| [ADR-003](ADR-003-module-structure-and-boundaries.md) | Module structure and boundary enforcement | Accepted |
| [ADR-004](ADR-004-inter-module-communication.md) | Inter-module communication — domain events | Accepted |
| [ADR-005](ADR-005-localization.md) | Localization — configurable with Saudi defaults | Accepted |
| [ADR-006](ADR-006-ksa-cloud-provider.md) | KSA cloud provider selection | **Accepted rev. 7** (Google Cloud `peoplegro-prod`, Cloud Run; UAT in `me-central1` Doha with sample data only; production in-Kingdom, path open — Cloud Run in `me-central2` is gated) |
| [ADR-007](ADR-007-api-conventions.md) | API conventions | Proposed |
| [ADR-008](ADR-008-modular-monolith-and-stack.md) | Modular monolith, single deployment, tech stack | Accepted |
| [ADR-009](ADR-009-google-calendar-data-minimization.md) | Google Calendar integration with data minimization | Accepted |
| [ADR-010](ADR-010-cloud-portability.md) | Cloud portability — the provider-neutral interface contract | Accepted (clause 1 excepted for Cloud Run — ADR-006 rev. 6; clauses 2–6 in force) |
| [ADR-011](ADR-011-employee-self-service.md) | Employee self-service — a third principal, isolated to one employee record | Accepted (amends ADR-002; architecture.md v1.5) |
| [ADR-012](ADR-012-prototype-visual-fidelity.md) | Pixel-exact fidelity to the People & Gro prototype — LTR layout in both locales, prototype status colours | Accepted (revises ADR-005 on layout direction; architecture.md v1.6) |
| [ADR-013](ADR-013-six-role-model.md) | Six built-in roles from the People & Gro prototype — Administrator, HR officer, GRO officer, Auditor, Client manager, Employee | Accepted (amends ADR-002; architecture.md v1.7) |
| [ADR-014](ADR-014-leave.md) | Leave — the employer approves, PEOPLE&GRO files; statutory types, caps and annual balances | Accepted (amends architecture.md scope, modules, catalog + matrix; v1.8) |

## Template

```markdown
# ADR-0XX — Title

- Status: Accepted | Proposed | Open | Superseded by ADR-0YY
- Date: YYYY-MM-DD
- Owner: name

## Context
Why a decision is needed; the forces at play.

## Options considered
Each realistic option with its main trade-off. One line each is enough.

## Decision
What we chose and the reasoning that tipped it.

## Consequences
What becomes easier, what becomes harder, what we must now do or watch.

## Links
Related ADRs, spikes, sections of architecture.md.
```
