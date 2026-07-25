# UX-10a — the two surfaces whose APIs already existed — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → UX-10a
- Status: done
- Commit: `UX-10a: portal user management and per-client settings`

## Why this was split from UX-10

The backlog line bundled three "missing surfaces", but they are two different
kinds of work:

| Surface | API | Permissions | UI before | Kind |
|---|---|---|---|---|
| Client-portal users | ✅ 5 routes, e2e-covered | ✅ `client-user.*` → Client Admin | ❌ none | **UI only** |
| Per-client settings | ✅ GET/PATCH/DELETE | ✅ `config.read` / `config.write-client` | ❌ none | **UI only** |
| Staff-user directory | ❌ nothing | ❌ `staff-user.*` absent | ❌ none | **new API module** |

The third needs permissions, a service, a controller, isolation-harness and
audited-writes registration and e2e tests before any UI exists — a backend
feature card, not polish. It is scoped as **UX-10b** rather than absorbed here.
(It is contract-sanctioned: architecture.md line 78 names a `staff-user` resource
with `staff-user.create`, and the matrix gives System Admin CRUD / Company Admin
R. It just deserves its own approval.)

## 1. Portal user management

A Client Admin held `client-user.read/create/update/delete` since CLIENT-03, and
had **no button**. The API takes no `clientId` — it derives it from the request
context — so the screen cannot address another company's users even in principle.

Verified by signing in as each of the three relevant principals:

| Principal | Nav entry | `/ar/portal/users` |
|---|---|---|
| **Client Admin** (client A) | ✅ `مستخدمو البوابة` | full screen; **only client A's user listed** |
| **Client User** (client B) | ❌ absent | `restricted` state naming `client-user.read`, no table |
| **Staff** (hr_officer) | ❌ absent | `restricted` state, shell intact (14 nav links) |

Both mutations driven through the UI:

- **Invite** → `ux10a-check@seed.hr.local` created as `مستخدم عادي` / `نشط`; the
  list went 1 → 2 rows.
- **Deactivate** → edited status to `معطّل`; the row's StatusPill updated.

The role trigger reads `مستخدم عادي`, not `client_user` — the UX-09 leak fix and
its lint rule holding on a brand-new screen.

**Deliberately no hard delete.** The API has `DELETE`, but deactivation is the
product action: a portal user has audit history, and disabling preserves it while
removing access. The destructive route stays unexposed until someone asks for it.

## 2. Per-client settings

`GET/PATCH/DELETE /config/client/:clientId` has existed since CONF-02 with no UI —
which is why enabling `flag.client-self-service` to verify the portal in UX-03c
meant **writing SQL by hand**, twice.

Driven end to end as Company Admin, on the exact flag:

```
before : flag.client-self-service · افتراضي النظام   · القيمة السارية: false
enable → flag.client-self-service · تجاوز خاص بالعميل · القيمة السارية: true
DB     → cfg_client_settings: 1 row  (client A, true)
clear  → flag.client-self-service · افتراضي النظام   · القيمة السارية: false
DB     → cfg_client_settings: 0 rows
```

The origin chip is the point: a settings screen that shows a value without saying
where it came from is how the same thing gets overridden twice.

### Two limits stated rather than papered over

1. **Origin is inferred, not reported.** `/config/client/:clientId` returns the
   *effective* map, not the override set, so "overridden" is derived by comparing
   against the system value. An override deliberately set to the same value as the
   system default is indistinguishable here. Reporting it exactly needs the API to
   return overrides — a contract change, so not in a UI card.
2. **Only booleans get an editor.** The catalog exposes `levels`, `default` and a
   description, but no options list and no type hint. A generic editor for enums,
   arrays and timezone strings would mean re-declaring every setting's shape in the
   web app — the kind of duplication that drifts silently. Booleans (both flags) get
   real controls; the rest are readable and their overrides clearable. A typed
   editor needs catalog metadata, which is its own card.

Company Admin correctly sees **no system-settings card** — `config.write` is the
System Admin's; the matrix distinction survives.

## The MFA wall, handled as promised

`config.write-client` is company_admin-only, and both admin roles are MFA-gated
with no seed user enrolled — the wall that stopped `/audit` being swept in UX-05.
As stated in the card, I enrolled TOTP for the seeded company_admin (computing the
code from the displayed dev secret), verified, then **cleared the secret**:

```
auth_users: 9 users, 0 with mfa_secret     ← seeded state restored
cfg_client_settings: 0 rows
ux10a-check@seed.hr.local: deleted
```

I did **not** seed a pre-enrolled admin. The seed's comment records a deliberate
AUTH-06 decision that it "never fakes enrollment", and reversing that to make my
own testing easier is exactly the drift these rules exist to prevent.

## One landmine re-encountered

The dev server threw `Cannot find module './vendor-chunks/@base-ui…'` on every
route — the documented hazard of running a production `next build` while the dev
server is up (it clobbers `.next`). I had done exactly that during the UX-09
checks. Cleared `.next` and restarted; worth noting it now presents as a
*vendor-chunk* module error, not the `./NNN.js` form the landmine records.

## Commands

```
pnpm turbo run lint typecheck build   # 15/15
pnpm --filter @hr/api test            # 336 passed
```

No API change.

## Files

- NEW `(app)/portal/users/page.tsx`
- `settings/page.tsx` (per-client section), `components/app-nav.tsx`,
  `lib/status-tone.ts` (`user` domain), `messages/{en,ar}.json`

## Next

**UX-10b** — the `staff-user` module: permissions, API, tests, directory UI, and
name resolution to replace the truncated UUID on Tasks, the UUID actor in Audit,
and the missing greeting on Today. Then UX-11 (accessibility pass).
