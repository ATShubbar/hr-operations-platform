# ADR-004 — Inter-module communication: domain events

- Status: Proposed
- Date: 2026-07-18
- Owner: TBD

## Context
Cross-module side effects are everywhere in the domain: a hired candidate becomes an employee; a document expiring triggers notifications; a client request spawns internal tasks; every mutation must be audit-logged. If Recruitment directly calls Employees, Notifications, and Audit, it accumulates dependencies on half the system and the "one owning module" rule collapses in practice.

## Options considered
1. **Direct service calls only.** Simple and traceable, but couples the caller to every consumer; adding a consumer means editing the producer.
2. **External message broker (RabbitMQ/Kafka).** Massive overkill for a modular monolith — new infrastructure, delivery semantics, and ops burden for in-process communication.
3. **In-process domain events, with a transactional outbox (Redis/BullMQ consumers) only where side effects must survive crashes.** Producers publish facts (`CandidateHired`); consumers subscribe. Same process, no broker.

## Decision
Option 3:
- Modules publish domain events through a shared in-process event bus; consumers register handlers. The producer does not know its consumers.
- **Criticality split:** side effects that must never be lost (audit entries, employee creation from a hire) are written through a transactional outbox in the same DB transaction as the triggering change, then processed by BullMQ workers. Best-effort effects (most notifications) may use fire-and-forget in-process dispatch.
- Event names are facts in past tense (`CandidateHired`, `DocumentExpiring`), owned by the publishing module and exported via its `public-api.ts`.
- Scheduled work (daily document-expiry scan) runs as BullMQ repeatable jobs owned by the module that owns the rule (Documents owns "what expires"; Notifications owns "how people are told").

## Consequences
- Adding a consumer never touches the producer; module dependency edges stay one-directional.
- Two delivery modes exist, so each event handler must be explicitly classified (transactional vs. best-effort) — this classification is part of design review.
- Handlers must be idempotent (outbox delivery is at-least-once).
- Debugging spans an async hop; correlation IDs from the request context must flow through events into job logs.

## Links
- `architecture.md` — Module Rules, Shared Modules
- ADR-003 (events cross the same boundary services do), `ACTION-PLAN.md` 0.4, 3.4
