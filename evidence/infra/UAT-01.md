# UAT-01 — Simple UAT logins, one shared password, no authenticator on UAT — Evidence

- Date: 2026-10-04
- Requested by the owner after UAT went live (GCP-06). Recorded as **ADR-013 rev. 2**.
- Status: **done** — commit `3354ed0`, deployed, re-seeded, smoke **33/33**.

## The decision and its recorded risk

| Asked | Built |
|---|---|
| One simple login per role, ending `@peopleandgro.com` | `admin@`, `hr@`, `gro@`, `auditor@`, `client@`, `employee@peopleandgro.com`. The same sample people, so their sample work stays theirs. The extra seats are `admin2@`, `hr2@`, `hr3@` and `client2@`. |
| Password `Admin!123` for all | The owner set it as version 2 of the `uat-seed-password` secret. It is **still not in the code**. The seed guard's minimum dropped from 16 to 8; the public dev password is still refused. |
| No authenticator on UAT | `UAT_DISABLE_MFA=true` in `infra/gcp/uat-env.yaml`. |

**Risk stated before building, and accepted by the owner** (options offered: a less guessable password, or keeping the authenticator for Administrator/Auditor):

- UAT is on the public internet. Anyone who guesses `admin@peopleandgro.com` / `Admin!123` is Administrator on UAT.
- What that exposes: sample data only, and no email ever leaves (capture transport).

## Containment: UAT only, enforced in code

- `auth/domain/uat-mfa.ts` turns the authenticator off **only** when `UAT_DISABLE_MFA === 'true'` **and** `APP_WEB_ORIGIN === 'https://uat.peopleandgro.com'`. Production serves `app.peopleandgro.com`, so a copied variable does nothing there.
- `test/uat-mfa-switch.e2e-spec.ts`:
  - the switch's six input cases;
  - an administrator still gets the limited "must enrol" session by default, and when the switch is set but the origin is production;
  - a full session only with both set.
  - **Red before the fix (2 of 4 failing, the "on" case returning 401), then green.**
- `prisma/seed-guard.ts`: `seedEmailFor` returns `@seed.hr.local` everywhere except `SEED_TARGET=uat`. An unmapped account throws rather than silently falling back. Cleanup deletes **exactly** the seed's addresses, never another `@peopleandgro.com` account. The `seed-guard` spec is now 5/5.
- Local development, CI and the e2e suite are unchanged: `@seed.hr.local` accounts, and Administrator/Auditor still enrol.

## Found and fixed on the way

- `infra/gcp/deploy-worker-pool.py` parsed `uat-env.yaml` by hand and would have passed the literal `"true"` (with quotes) to the worker. It now strips YAML quotes. Read back from the worker pool: `UAT_DISABLE_MFA = true`.

## Rehearsal (local, before deploying)

- I ran the UAT-mode seed against the local database: 10 accounts created at `@peopleandgro.com`, and the `@seed.hr.local` ones replaced.
- The UAT-mode smoke check against it passed every role. The only failures were Administrator and Auditor, as expected locally: the switch is off there, so they got the "must enrol" session.
- Then I restored the normal local seed: 10 `@seed.hr.local` accounts, 0 at `@peopleandgro.com`.

## On UAT

- Deployed `3354ed0`. Read back from the services: `uat-api` has `APP_WEB_ORIGIN=https://uat.peopleandgro.com` and `UAT_DISABLE_MFA=true`; `uat-worker` has `UAT_DISABLE_MFA=true`.
- The owner ran **Seed UAT** (`seed-and-smoke`, address `https://uat.peopleandgro.com`):
  - seed job `uat-seed-rgvnk`: succeeded;
  - smoke job `uat-smoke-822wd`: **33/33**.

```
PASS  health  (version 3354ed09546c98b16fd521f322d07cccb0c07258)
PASS  ready (database + Redis)
PASS  hr / gro / client / employee: signs in · correct role · allowed 200 · refused 403
PASS  staff-administrator: signs in (HTTP 200) · is administrator · GET /audit allowed · GET /me refused (403)
PASS  staff-auditor: signs in (HTTP 200) · is auditor · GET /audit allowed · GET /me refused (403)
PASS  document: upload issued · bytes stored in the bucket · scanned and available · same bytes back · cleaned up
PASS  request: raised by the client manager · taken up by HR
All checks passed
```

Administrator and Auditor signing in with **only a password** is the switch working.

Worker, from the `uat-worker` log:

```
2026-10-04T12:17:47Z  daily expiry scan scheduled (0 6 * * * Asia/Riyadh)      (new instance, 3354ed0)
2026-10-04T12:21:47Z  email → client@peopleandgro.com: تحديث حالة الطلب: قيد المعالجة
```

## Notes

- The `@peopleandgro.com` addresses are real-domain addresses. UAT sends **no** email today (capture transport). If UAT ever gets real SMTP, invites and resets would go to those mailboxes, so revisit this first.
- Re-seeding resets the data and these accounts. The password always comes from the secret's latest version.
