# ADR-008 — Modular monolith, single deployment, tech stack

- Status: Accepted (founding decision, recorded retroactively)
- Date: 2026-07-18
- Owner: TBD

## Context
A small team is building a broad product (recruitment, GRO, employees, documents, portal, reporting) for one consultancy, hosted in KSA. The architecture style and stack determine hiring, operational burden, and how well AI-assisted development works.

## Options considered
1. **Microservices.** Independent scaling and deployment — none of which this team or load profile needs; the cost is distributed-systems complexity, N databases to keep in KSA, and heavy ops. Rejected.
2. **Unstructured monolith.** Fastest week one; without internal boundaries it becomes unmaintainable and can never be split. Rejected.
3. **Modular monolith.** One application, one deployment, one PostgreSQL database; strict internal module boundaries (ADR-003) and events (ADR-004) keep a future extraction path open without paying distribution costs now.

## Decision
Option 3, with this stack:
- **Frontend:** Next.js, React, TypeScript, Tailwind (logical properties), shadcn/ui, React Hook Form, Zod, TanStack Query.
- **Backend:** NestJS (TypeScript) — module system aligns naturally with the modular monolith.
- **Data:** PostgreSQL (single database, RLS per ADR-001), Prisma ORM, Redis (sessions, cache, BullMQ queues — never a source of truth).
- **Infra:** Docker, GitHub + GitHub Actions, S3-compatible object storage, KSA-hosted provider (ADR-006).

TypeScript end-to-end is deliberate: shared Zod contracts give full-stack type safety and suit AI-assisted development.

## Consequences
- One deployable, one database to secure, back up, and keep in KSA — the residency story stays simple.
- Scaling is vertical-first, then read replicas; if a module ever needs independent scaling, boundaries + events make extraction feasible (that would be a new ADR).
- The whole design leans on boundary discipline; ADR-003's enforcement tooling is what keeps this from becoming option 2.
- Redis discipline ("never source of truth") is a standing review rule.

## Links
- `architecture.md` — Non-Negotiable Principles, Tech Stack
- ADR-001, ADR-003, ADR-004, ADR-006
