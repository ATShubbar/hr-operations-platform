# AUTH-03 — Session guard + request context — Evidence

- Date: 2026-07-20
- Task card: `BACKLOG.md` → AUTH-03
- Status: done
- Commit: `AUTH-03: resolve sessions into request context, 401 semantics`

## DoD check

| DoD item | Result |
|---|---|
| No cookie → 401 on declared endpoints | ✅ authz spec + harness staff/client-scoped probes |
| Garbage/expired cookie → 401 | ✅ (treated as unauthenticated, never an error) |
| Valid session → 200 with real `actorId` in every log line of the request | ✅ logging spec asserts `actorId === userId` across all traced lines |
| Client-rep session carries `clientId` into context → RLS scope | ✅ harness: scope-check returns only own-client rows via REAL login (test-only identity middleware **retired**) |
| `@Public` unaffected | ✅ health/ready/login |
| Full suite green | ✅ 35/35 (8 suites); lint/typecheck/build PASS |

## Evidence

```
 Test Files  8 passed (8)
      Tests  35 passed (35)
```

Auth chain now end-to-end real: login → Redis session → session middleware
→ request context → guard (401/403 split) → scoped Prisma client → RLS.

## Notes

- 401 = not logged in; 403 = endpoint missing permission metadata
  (deny-by-default) — distinct on purpose, both tested.
- No cookie-parser dependency: the middleware parses the single known
  cookie itself — one wiring, identical in main.ts and tests.
- Guard's remaining seam is now exactly one line: `policy.can(actor,
  permission)` — AUTH-04.
