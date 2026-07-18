# Module layout contract (ADR-003)

Every business/shared module lives in `src/modules/<name>/` with this shape:

```
modules/<name>/
  public-api.ts       ← the ONLY file other modules may import from (lint-enforced)
  <name>.module.ts    ← NestJS module wiring
  api/                ← HTTP controllers (thin: validate → call application → map response)
  application/        ← services / use-cases (the module's capabilities)
  domain/             ← entities, value objects, domain events (add when needed)
  infra/              ← persistence and external adapters (add when needed)
```

## Rules

1. **Cross-module imports go through `public-api.ts` only.** Deep imports into another module's internals are a lint error (WS-08) and a review-blocking defect.
2. **`public-api.ts` exports the minimum**: the NestJS module class plus the services/events/types other modules are meant to use. If it isn't exported there, it's private.
3. **Own your data**: each module's tables carry its prefix (`example` → `ex_`, recruitment → `rec_`, GRO → `gro_`, employees → `emp_`, …). No module touches another module's tables — call the owning module's service or subscribe to its events (ADR-004).
4. **One owning module per capability.** Minimal code duplication is allowed when it reduces coupling; duplicated ownership of a business rule is never allowed.
5. `domain/` and `infra/` are added when the module actually needs them — empty ceremony directories are noise.

The `example/` and `example-consumer/` modules are the living reference for this shape (and the lint rule's test subjects). Copy `example/` when starting a new module.
