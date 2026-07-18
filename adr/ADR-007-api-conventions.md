# ADR-007 — API conventions

- Status: Proposed
- Date: 2026-07-18
- Owner: TBD

## Context
One NestJS API serves two frontends (staff app, client portal) and possibly future surfaces (mobile, exports). Conventions decided once — style, versioning, pagination, errors, idempotency — are nearly free; decided per-module, they produce a patchwork API that is expensive to fix and confusing to consume.

## Options considered
1. **GraphQL.** Flexible querying, but adds schema/resolver complexity, complicates per-field authorization (risky given field-level sensitivity), and caching. Not justified for a first-party CRUD-heavy product.
2. **tRPC.** Excellent TS ergonomics, but couples clients tightly to the server and complicates future non-TS consumers and public APIs.
3. **REST with OpenAPI generated from NestJS decorators.** Boring, cacheable, tooling-rich; shared contracts via `packages/contracts` Zod schemas keep end-to-end type safety.

## Decision
Option 3, with these conventions:
- **Versioning:** URI prefix `/api/v1`; breaking changes require a new version, additive changes do not.
- **Pagination:** cursor-based everywhere (offset pagination drifts under concurrent writes).
- **Errors:** one envelope — machine-readable code, human message (localized), correlation ID; no raw stack traces or ORM errors ever leave the API.
- **Idempotency:** mutating endpoints that clients may retry (uploads, request submission) accept an `Idempotency-Key` header, deduplicated in Redis.
- **Rate limiting:** per-client-company and per-user, in Redis; portal endpoints get stricter defaults.
- **Contracts:** request/response schemas defined in Zod in `packages/contracts`, consumed by both the API (validation) and the web app (types + forms).

## Consequences
- Any future consumer (mobile, integration partner) can be served without rework; OpenAPI docs come for free.
- Cursor pagination requires stable sort keys on list endpoints — a schema-design consideration, not an afterthought.
- The error envelope's localized messages depend on ADR-005's string externalization reaching the API layer.

## Links
- `architecture.md` — Tech Stack
- ADR-003 (contracts package), ADR-005 (localized errors), `ACTION-PLAN.md` 0.7
