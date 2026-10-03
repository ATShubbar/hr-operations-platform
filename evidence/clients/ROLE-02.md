# ROLE-02 — Administrators manage client portal users (staff path) — Evidence

- Date: 2026-10-03
- Task card: `BACKLOG.md` → ROLE-02 (ADR-013 sequencing: before ROLE-03)
- Status: done
- Commit: `ROLE-02: Administrators manage any client's portal users`

## Why this card exists

ADR-013 moves portal-user management from Client Admins to Administrators. The existing API
(`/client-users`, CLIENT-03) takes the company from the CALLER's session and refuses staff. So
until a staff path existed, taking `client-user.*` away from client reps (ROLE-03) would have
left **nobody** able to manage portal accounts. This card adds that path and removes nothing.

## What changed

| File | Change |
|---|---|
| `modules/clients/api/client-portal-users.controller.ts` (new) | `GET/POST /clients/:clientId/users`, `GET/PATCH/DELETE /clients/:clientId/users/:id`. The company comes from the **PATH**. **Staff only, via `scopeOf`, checked BEFORE anything else**: client reps hold the same `client-user.*` today, so the permission guard alone would let a Client Admin address another company by editing the URL. Unknown or malformed company → 404. A user from another company → 404 (the service looks up by `(id, clientId)`). |
| `modules/clients/api/client-users.controller.ts` | Response mapper exported as `toClientUserResponse`, so both paths return one shape |
| `modules/clients/clients.module.ts` | Controller registered |
| `auth/domain/permissions.ts` | `client-user.read/create/update/delete` → **system_admin + company_admin**, the roles ADR-013 merges into Administrator. `/client-users` still refuses them (no client scope) |
| `test/isolation/endpoint-registry.ts` | 5 routes, class `staff` |
| `test/audit/audited-writes.ts` | 3 writes (`client-user.create/update/delete`) |
| `test/client-portal-users.e2e-spec.ts` (new) | 11 tests, below |
| web `clients/portal-users-dialog.tsx` (new), `clients/page.tsx` | A **Portal users** row action on Clients, shown to `client-user.read` holders. It opens a dialog with list, invite, and edit role/status, reusing the portal's own `portal.users.*` wording. The edit form says that disabling signs the person out everywhere |
| `messages/{en,ar}.json` | `clients.portalUsers`, `close`, `portalUsersTitle`, `portalUsersHint`, `portalUsersDisableHint` |

**Deviation from the card:** the card said "a section on the client record". **There is no
client record page.** `/clients` is a list only, and the record page arrives with DS-05+. So the
section is a dialog opened from the row. It is built so the DS-05+ record screen can host the
same component instead of redesigning it.

## Tests — `client-portal-users.e2e-spec.ts`, 11/11

1. Unauthenticated → 401.
2. **company_admin manages client A AND client B.** It invites at each, and each list holds only
   its own users. The new row's `client_id` is the PATH's company. It can get, change role, and
   deactivate (soft: the row survives).
3. system_admin holds it too (200).
4. **A user id from another company → 404** on GET, PATCH and DELETE, and the user is untouched.
5. Unknown company or malformed id → 404, including on POST.
6. HR officer and GRO officer → 403 (GET + POST).
7. **A Client Admin, who HOLDS `client-user.*`, → 403** on its own company's path AND another's.
   B's user count is unchanged.
8. Employee → 403.
9. `/client-users` still refuses staff, **even an Administrator** (403).
10. **Deactivating ends the portal user's open session.** Their `/auth/me` goes 200 → 401.
11. Writes are audited: create + update + deactivate, actor = the company_admin,
    `actor_role = company_admin`, `client_id` = the PATH's company.

**Test 7 is load-bearing, proven red.** With the `scopeOf` check disabled, test 7 FAILS
(1 failed / 10 passed). With it restored, 11/11.

**Full API suite: 484/484, three runs** (473 + 11). Isolation 21/21 and write-coverage are green
with the new routes registered. API typecheck and lint are clean.

## Live verification (dev servers restarted for the new module and messages)

As the **seed company_admin**. Its role requires two-factor sign-in, so TOTP was enrolled for
this check. The code was generated in-page with WebCrypto, so the secret never left the
browser. The secret was **cleared afterwards**, and 0 seed users are enrolled now.

| Check | Result |
|---|---|
| `/auth/me` permissions | `client-user.read/create/update/delete` |
| `/en/clients` | 5 rows, each with **Portal users** · Edit · (Archive) |
| Alpha Trading Co. | dialog "Portal users — Alpha Trading Co.", 1 row `client_admin-a@seed.hr.local` · Administrator · Active |
| Beta Contracting Est. | 1 row `client_user-b@…`; **invited `role02-ui-check@example.com` through the form** → 2 rows |
| session ended | signed in as the new user with curl against the API: `/auth/me` **200**; disabled in the dialog → **401**; the row shows **Disabled** |
| `/ar/clients` at 375 | title «مستخدمو البوابة — مؤسسة الباء للمقاولات», Arabic hint, roles «مستخدم عادي», statuses «نشط/معطّل»; dialog 343px wide at x 16; **0px page overflow** |
| accessible names | the edit selects are labelled «الدور» / «الحالة» (`labels` on the comboboxes), as is the invite role select |
| hr_officer | `/en/clients`: 5 rows, **0 Portal users buttons, 2 header cells** (no empty actions column); `GET /api/clients/<A>/users` → **403** |

## Bug caught while verifying

**The role and status selects had no accessible name.** The form copied the portal page's
`<Label>` with no `htmlFor`. They are now associated (the UX-13 pattern) and measured via
`combobox.labels`.

The portal page `(app)/portal/users` has the same defect. ROLE-03 retires that screen, so it is
recorded here rather than fixed twice.

## Cleanup

- The seed company_admin's `mfa_secret` was cleared.
- The `role02-ui-check@example.com` account was deleted.
- `cpu-test-%` leftovers: 0.
- The admin session was ended by signing out.
- Audit rows stay: the trail is append-only.

## Not done here (by design)

- Client reps still hold `client-user.*`, and `/portal/users` still works. **ROLE-03** removes
  them, now that Administrators can do it.
- No production SMTP. Inviting still sets an initial password (CLIENT-03's flow, unchanged).
