# AUDIT-05 — First UI: login + app shell + audit viewer — Evidence

- Date: 2026-07-21
- Task card: `BACKLOG.md` → AUDIT-05 (ACTION-PLAN 2.3)
- Status: done
- Commit: `AUDIT-05: first UI — login + MFA, app shell, audit viewer`

## What shipped (the first real product UI)

- **Web↔API integration with zero API changes:** Next.js rewrite proxies
  `/api/*` → the NestJS API, so the browser is single-origin and the httpOnly
  session cookie flows without CORS. Browser client `lib/api.ts` (`apiFetch`,
  `ApiError`).
- **Login + MFA** (`/[locale]/login`): email/password → full session (redirect),
  or the AUTH-06 admin flow — `mfaEnrollRequired` → enroll (shows setup key) →
  verify; `mfaRequired` → challenge. Branches purely on the login JSON.
- **App shell** (`/[locale]/(app)/layout.tsx`): sidebar nav + header (language
  switcher, sign-out). Logical utilities throughout so it mirrors in Arabic.
- **Audit viewer** (`/[locale]/(app)/audit`) over `GET /audit` (AUDIT-04):
  filter by resource/action, table (time/actor/role/client/resource/action),
  cursor "load more"; a 401 bounces to `/login`.
- **i18n:** `auth`, `nav`, `audit` namespaces added to ar + en; zero hardcoded
  strings. Inherits the gold/`base-rhea` theme + Inter.

## DoD check

| DoD item | Result |
|---|---|
| Login screen works (LTR + RTL, themed) | ✅ renders in gold theme + Inter; both directions |
| Admin MFA flow reaches the app | ✅ system_admin: login → enroll → verify (real TOTP) → `/audit` |
| Audit viewer shows real data from the API | ✅ 5 entries created via the real pipeline render in the table |
| Auth-gated (401 → login) | ✅ audit fetch redirects to `/login` on 401 |
| ar/en + RTL, logical utilities only | ✅ Arabic view mirrored (sidebar right, columns reversed); web lint (RTL rule) green |
| `lint typecheck test build` green | ✅ turbo 15/15; API suite unchanged 71/71 |

## End-to-end verification (browser, dev servers)

Real audit data was generated through the **actual pipeline** — client-rep
logins + 5× `POST /scope-check` (201 each) → 5 `aud_entries` rows — not seeded
directly. Then, driving the browser:

1. `/en/login` renders the themed sign-in card (screenshot).
2. Filled system_admin credentials → `POST /api/auth/login` 200 →
   `POST /api/auth/mfa/enroll` 200 → enroll step shows the setup key.
3. Computed the live TOTP for that key (same `otplib` the API uses) →
   `POST /api/auth/mfa/verify` → redirected to `/en/audit`.
4. `/en/audit` shows all 5 entries (actor/role/client/resource/action=create).
5. Desktop viewport → sidebar visible ("HR Operations Platform" + Audit log nav).
6. `/ar/audit` → `dir=rtl`, "سجل التدقيق", sidebar mirrored to the right,
   table columns reversed, fully translated.

## Design decisions recorded

- **Proxy over CORS.** `/api/*` rewrite keeps the browser single-origin, so the
  `SameSite=Lax` httpOnly cookie just works and the API needed no CORS/change.
  Target is env-overridable (`API_PROXY_TARGET`) for staging/prod.
- **Per-page auth gating.** No `/auth/me` endpoint exists yet, so pages guard by
  reacting to a 401 (→ `/login`) rather than a server-side session check. A
  session/identity endpoint + a server guard is the clean follow-up.

## Deferred (stated, not silently dropped)

- **TanStack Query** (in the frozen stack) is NOT wired yet — this slice uses
  plain `fetch` for one list + imperative auth calls. Adopting it (caching,
  query invalidation) is a fast-follow; noted so it isn't mistaken for done.
- **MFA enroll shows the setup key as text**, no QR image yet (functional; QR
  is a polish follow-up).
- **App-shell route protection** is client-side (401 redirect); a server guard
  awaits a session endpoint.
- **Login screen is not carded as its own task** — folded here per the owner's
  request to include it with AUDIT-05.

## Notes

- One first-load flake during manual testing: an in-flight HMR recompile raced a
  submit and bounced to `/en`. It did not reproduce once routes were compiled
  and cannot occur in a production build (no HMR). Not a code defect.
