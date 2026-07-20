# AUTH-02 — Login endpoint + Redis sessions — Evidence

- Date: 2026-07-20
- Task card: `BACKLOG.md` → AUTH-02
- Status: done
- Commit: `AUTH-02: add login endpoint with argon2 and Redis sessions`

## DoD check

| DoD item | Result |
|---|---|
| Valid login → 200 + httpOnly cookie + session in Redis | ✅ e2e asserts cookie flags (HttpOnly, SameSite=Lax) AND reads the session back from Redis: `{userId, principalType, clientId}` correct for both staff (clientId null) and client-rep (bound to client A) |
| No user enumeration | ✅ wrong-password and unknown-email responses asserted IDENTICAL (same 401 body); unknown-email path still runs a real argon2 verify against a dummy hash for timing parity |
| Disabled user → 401 | ✅ |
| Malformed payload → 400 (validation, not auth) | ✅ |
| Lint/typecheck/build/tests green | ✅ 33/33 (8 suites) |
| Registry coverage | ✅ `POST /auth/login` registered `public`; harness public-probe upgraded to method-aware (a GET-only probe would have 404'd POST routes) |

## Evidence

```
 Test Files  8 passed (8)
      Tests  33 passed (33)
```

## Notes

- CI gained a redis:7 service + REDIS_URL (login e2e needs it — same class of gap as the WS-18 Postgres discovery, caught preemptively this time).
- Session TTL 12h; cookie `secure` flips on automatically when NODE_ENV=production.
- Rate limiting deliberately deferred to the ADR-007 cross-cutting work (recorded decision, not an oversight).
- Staging Redis (ElastiCache) still deferred until WS-20 unblocks — local + CI only.
