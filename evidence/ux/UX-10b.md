# UX-10b — the staff-user module — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → UX-10b
- Status: done
- Commits: `UX-10b (1/2): staff-user API, permissions and the name directory`,
  `UX-10b (2/2): the directory screen and name resolution`

## One root cause, three symptoms

`auth_users` had **no name column**, and nothing listed staff users:

| Symptom | Before | After |
|---|---|---|
| Tasks assignee | `a1b2c3d4` | `Omar Al-Shehri` |
| Audit actor | `4f32b505` | the person's name |
| Today greeting | none (UX-04 refused to fake one) | `مرحباً، Faisal Al-Otaibi` |

## The matrix conflict, and how it was resolved

The row **"System config & staff users"** is System Admin CRUD / Company Admin R /
nothing for everyone else. That is right for *managing* accounts — but an HR
Officer looking at a task needs to know **who it is assigned to**, and under the
row as written they may not read staff users at all.

Rather than widen a row that deliberately says "–" for six roles (drift), the
owner chose **option 2**: a separate, strictly narrower capability.

```
staff-user.read       → management view: email, status, MFA enrollment, timestamps
staff-user.directory  → id + displayName + role, and NOTHING else. Every staff role.
```

Recorded as a **catalog addition, not a matrix change**, with the reasoning in the
permission catalog itself.

The e2e spec pins the split down, because the easy failure is the narrow endpoint
quietly growing into the broad one — the directory's keys are asserted **exactly**:

```ts
expect(Object.keys(entry).sort()).toEqual(['displayName', 'id', 'role']);
expect(JSON.stringify(users)).not.toMatch(/@|password|hash|secret|mfa|status/i);
```

So a field added to the management shape cannot ride along.

## API

- Nullable `display_name` on `auth_users` (additive migration, no backfill)
- `StaffUsersService` + `StaffUsersController` in the **auth** module — auth owns
  `auth_users` (ADR-003 rule 3). `ClientUsersService` is the mirror image: it
  lives in `clients` and drives auth through its public API
- 6 routes registered in the isolation harness; 3 audited writes registered
- `/auth/me` carries `displayName` — one lookup per app mount rather than storing
  it in the Redis session, where a rename would go stale until the next sign-in

**Self-protection**, with tests: an administrator cannot disable or demote their
own account. There is one system_admin seat, and locking it out of its own console
is unrecoverable without database access. Renaming yourself is still allowed.

**Deactivation, never deletion** — sessions and audit entries reference these ids.
The spec asserts the row still exists after a `DELETE`.

**API suite: 350/350** (336 + 14 new).

## Verified live, per role

| Principal | Result |
|---|---|
| **gro_officer** | greeted `مرحباً، Turki Al-Harbi`; **no** staff-users nav entry (lacks `staff-user.read`) |
| **company_admin** | sees the directory — and it is **read-only**: no add button, no row actions, matching CRUD-vs-R in the UI and not only in the API |
| Tasks with `task.read-all` | 7 rows, every assignee a name, **zero id fragments**; unassigned still reads `غير مُسنَدة` |

### One thing that still shows a short id, correctly

Two audit rows kept `4f32b505`-style actors. Checked rather than assumed:

```sql
select u.email from aud_entries a left join auth_users u on u.id = a.actor_id …
→ email NULL   -- the user no longer exists
```

They are deleted e2e helper accounts. An audit trail keeps the actor id after the
account is gone, and a directory cannot name someone who is not there — so the
fallback to a short id is the designed behaviour. It is also a neat argument for
why real accounts are deactivated rather than deleted.

## Notes

- The name lookup fails **silently** by design: a directory that cannot be fetched
  degrades to the id rather than taking down the screen that merely wanted to
  label a row.
- The e2e spec initially failed with every admin request 401 — admin roles require
  MFA enrollment (AUTH-06), and the helper for that is `loginAsEnrolledStaff`, not
  `loginAsStaff`. Worth knowing before writing the next admin-touching spec.
- Browser verification needed a real admin session, so TOTP was enrolled for the
  seeded company_admin and **cleared afterwards** — 9 users, 9 named, 0 enrolled.
  The seed still never fakes enrollment.

## Commands

```
pnpm --filter @hr/api test            # 350 passed
pnpm turbo run lint typecheck build   # 15/15
```

## Files

- `prisma/schema.prisma` + migration; `prisma/seed.ts` (names for the nine users)
- NEW `auth/application/staff-users.service.ts`, `auth/api/staff-users.controller.ts`
- `auth/domain/permissions.ts`, `auth/auth.module.ts`, `auth/api/auth.controller.ts`
- NEW `packages/contracts/src/staff-user.ts`; `auth.ts` (`displayName` on `/auth/me`)
- `test/staff-users.e2e-spec.ts` (14 tests), harness + audited-writes registries
- NEW `(app)/staff-users/page.tsx`, `lib/staff-directory.ts`
- `tasks/page.tsx`, `audit/page.tsx`, `today/page.tsx`, `components/app-nav.tsx`

## Next

UX-11 — the accessibility pass: active nav state, keyboard-reachable agenda rows,
heading outline. It is the last card in the epic.
