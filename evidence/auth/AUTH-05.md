# AUTH-05 — Logout + session revocation — Evidence

- Date: 2026-07-20
- Task card: `BACKLOG.md` → AUTH-05
- Status: done
- Commit: `AUTH-05: add logout with real session revocation`

## DoD check

| DoD item | Result |
|---|---|
| Revocation proven | ✅ e2e: cookie works → logout 200 → SAME cookie 401 on protected endpoint immediately |
| Cookie cleared in response | ✅ `Set-Cookie: hr_session=;` asserted |
| Logout without session / double logout → 401 | ✅ both |
| Suite green | ✅ 42/42 (10 suites); lint/typecheck/build PASS |

## Notes

- `session.end` added to the catalog and granted to ALL nine roles —
  logging out must never be forbidden.
- Registered as `staff` scope class in the harness (gets the
  unauthenticated→401 probe; client roles hold the permission too).
- Decision recorded: fixed 12h TTL, no sliding renewal until a real UX
  requirement demands it.
