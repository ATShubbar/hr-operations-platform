# PORTAL-01 — Client portal foundation (own company + flag gate) — Evidence

- Date: 2026-07-24
- Task card: `BACKLOG.md` → PORTAL-01 (ACTION-PLAN 5.1)
- Status: done
- Commit: `PORTAL-01: client portal module — GET /portal/company (flag-gated, client-scoped)`

## What shipped

The Client Portal foundation — a **dedicated delivery module** with the first
client-facing, own-scoped, flag-gated read, plus the reusable portal-access gate.

- **`modules/portal`** — a pure delivery layer (no service/table of its own):
  `PortalController` reads the domain modules' services and returns only the
  caller's own client's data. A **leaf module** (nothing imports it), so importing
  ClientsModule + ConfigurationModule creates no cycle.
- **`GET /portal/company`** (`portal.read`) — returns the caller's **own** company
  (`ClientsService.getById(ctx.clientId)`; the client id is always from the
  session, never input), gated by the per-client **`flag.client-self-service`**
  → 403 when off.
- **`portal.read`** — a **client-only** permission (granted to both client roles,
  never staff), so `/portal/*` is exclusively the client self-service surface and
  can't be reached by staff (403). The reusable `assertPortalAccess(clientId)`
  gate is what PORTAL-02/03 will apply to `/portal/employees` and
  `/portal/documents`.

## Design decisions recorded

- **Dedicated `/portal/*` module, NOT principal-aware `/clients`.** I initially
  proposed principal-aware staff endpoints, but (a) the architecture describes the
  Client Portal as *its own* delivery module (module 10: "delivery surface over
  existing modules … no business logic of its own"), and (b) making the staff
  ClientsController read a config flag created a **real DI cycle** (ConfigurationModule
  already imports ClientsModule for CONF-02 client validation; `@Global` couldn't
  fix the init-order). A leaf PortalModule is both more architecturally correct
  and cycle-free. *(The user had offered `/portal/*` as the alternative.)*
- **`portal.read`, not `client.read`, for reps.** Granting reps the staff
  `client.read` would let them hit the staff `GET /clients` (cross-client) and
  leak every company. A client-only `portal.read` on separate endpoints closes
  that by construction; staff endpoints are untouched.
- **The flag is load-bearing at the API** (403 when off), per-client, keyed on the
  session clientId.

## DoD check

| DoD item | Result |
|---|---|
| Rep `GET /portal/company` → their own company only (id from session) | ✅ test 2 (repA→A, repB→B) |
| 403 when `flag.client-self-service` is off; 200 when on | ✅ tests 1–2 |
| Client-only surface — staff (no portal.read) → 403 | ✅ test 3 |
| Unauthenticated → 401 | ✅ test 4 |
| No DI cycle; app boots | ✅ suite boots AppModule |
| Isolation (`client-read`) + catalog coverage green | ✅ `GET /portal/company` registered; `portal.read` declared+used |
| Suite + lint + typecheck + build green | ✅ suite **222/222** |

## Test output (`test/portal-company.e2e-spec.ts`, 4/4)

```
✓ is blocked (403) while flag.client-self-service is off
✓ with the flag on, each rep gets ONLY their own company
✓ is client-only — staff lack portal.read (403)
✓ rejects unauthenticated callers (401)
```

Full suite **45 files / 222 passed**; lint + typecheck + build clean.

## Deferred (to later PORTAL cards)

- **PORTAL-02** — `GET /portal/employees[/:id]`: rep reads own employees, redacted
  to **core + govdata:status only** (no salary, no identifiers) — the deferred
  EMP-02 status tier.
- **PORTAL-03** — `GET /portal/documents[/:id/download]`: rep reads/downloads own
  documents.
- **PORTAL-04** — the client portal **UI** (flag-gated shell + company / employees
  / documents / requests pages).
