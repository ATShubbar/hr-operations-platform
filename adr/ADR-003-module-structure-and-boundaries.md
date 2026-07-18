# ADR-003 — Module structure and boundary enforcement

- Status: Accepted (2026-07-18 — layout proven in WS-07, boundary lint proven with deliberate violations in WS-08)
- Date: 2026-07-18
- Owner: TBD

## Context
The architecture mandates "modules communicate only through public interfaces, no cross-module DB access" — but nothing in the stack enforces it. Prisma generates one global client over one schema, so any module can query any table. Without tooling, the modular monolith degrades into a tangled monolith. AI-assisted development sharpens this: the AI Master Prompt says "never generate code outside the current module," which is meaningless until a module has a concrete shape.

## Options considered
1. **Convention only (code review discipline).** Free, and reliably erodes under deadline pressure and code generation. Rejected as the sole mechanism.
2. **Nx monorepo with `enforce-module-boundaries`.** Strong tooling, but brings the full Nx workspace model; heavier than needed.
3. **pnpm workspaces + Turborepo + ESLint import-boundary rules (`eslint-plugin-boundaries`), module-prefixed tables, per-module Prisma access wrappers.** Lightweight, incremental, CI-enforceable.

## Decision
Option 3 (final layout to be confirmed when the walking skeleton lands):
- Monorepo: `apps/web`, `apps/api`, `packages/contracts` (shared Zod schemas), `packages/config`.
- Each API module lives in `apps/api/src/modules/<name>/` and exports exactly one `public-api.ts`; ESLint blocks any import that bypasses it, and CI fails on violations (proven with a deliberately bad PR — walking skeleton DoD 1.2).
- Tables are module-prefixed (`rec_`, `gro_`, `emp_`, …); each module accesses only its own models through a scoped Prisma wrapper.
- **Ownership rule:** every capability has exactly one owning module. Minimal code duplication is permitted when it genuinely reduces coupling; duplicated *ownership* of a business rule is never permitted.

## Consequences
- "Module" becomes a checkable claim, not a diagram concept; boundary violations are build failures.
- Slightly more ceremony per module (wrapper + public-api), paid back every time a module is refactored in isolation.
- The Prisma schema remains physically global; discipline lives in the access layer and lint rules, so those rules are part of the definition of done for every module.

## Links
- `architecture.md` — Module Rules
- ADR-004 (events are the other half of the boundary story), `ACTION-PLAN.md` 0.3, 1.1
