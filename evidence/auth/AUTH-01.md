# AUTH-01 — Auth module + users table — Evidence

- Date: 2026-07-20
- Task card: `BACKLOG.md` → AUTH-01
- Status: done
- Commit: `AUTH-01: add auth module and users identity model`

## DoD check

| DoD item | Result |
|---|---|
| Migration applies to fresh DB | ✅ all migrations green on `hr_platform_fresh`, then dropped |
| Staff-only grants proven | ✅ `information_schema.role_table_grants`: `app_staff → INSERT,SELECT,UPDATE,DELETE`; **no app_client row** |
| Module behind public-api, boundary lint green | ✅ lint PASS |
| Service e2e | ✅ 4 new tests (28/28 suite): staff user (clientId null), client-rep bound to client, case-insensitive email find, duplicate rejected |
| No endpoints yet; registry untouched | ✅ isolation coverage spec still green |

## Notes

- Prisma 7 generator gotcha recorded: row types export as `<Model>Model`
  (e.g. `AuthUserModel`), not `<Model>` — caught by tsc, invisible to
  vitest's SWC transform. Aliased at import.
- Emails normalized to lowercase at the service boundary.
- `mfa_secret` + argon2-sized `password_hash` reserved now (AUTH-02/06
  need no schema churn).
