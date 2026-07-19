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
| [ADR-004](ADR-004-inter-module-communication.md) | Inter-module communication — domain events | Proposed |
| [ADR-005](ADR-005-localization.md) | Localization — configurable with Saudi defaults | Accepted |
| [ADR-006](ADR-006-ksa-cloud-provider.md) | KSA cloud provider selection | Accepted rev. 4 (interim staging AWS UAE, no-production-data guard; KSA target via CNTXT/AWS-Saudi; OCI fallback) |
| [ADR-007](ADR-007-api-conventions.md) | API conventions | Proposed |
| [ADR-008](ADR-008-modular-monolith-and-stack.md) | Modular monolith, single deployment, tech stack | Accepted |
| [ADR-009](ADR-009-google-calendar-data-minimization.md) | Google Calendar integration with data minimization | Accepted |

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
