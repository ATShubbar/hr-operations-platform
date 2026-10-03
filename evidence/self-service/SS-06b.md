# SS-06b — Employee accounts on the web — Evidence

- Date: 2026-10-03
- Task card: `BACKLOG.md` → SS-06b (SS epic, ADR-011)
- Status: done
- Commit: `SS-06b: set-password, forgot-password, and self-service access on the employee record`
- Scope: `apps/web` only. **No API change.**

## What changed

| File | Change |
|---|---|
| `components/auth-frame.tsx` (new) | the signed-out frame (form column + brand panel, panel hidden below `lg`), extracted from the UX-16 login page so login, set-password and forgot-password cannot drift |
| `app/[locale]/login/page.tsx` | uses `AuthFrame`; "Forgot your password?" on the password LABEL row (`leading-none`); accounts note now true for both populations |
| `app/[locale]/account/layout.tsx` (new) | `referrer: no-referrer` for the signed-out account pages |
| `app/[locale]/account/set-password/page.tsx` (new) | reads `#token`, strips it from the URL at once (`replaceState`), keeps it in **sessionStorage for this tab** until used or refused; new + confirm, ≥10, inline errors (`role=alert`, `aria-invalid`, `aria-describedby`); done → sign-in link; any refusal → one honest "can't be used" page + a new-link link |
| `app/[locale]/account/forgot-password/page.tsx` (new) | one answer for everything; says it is for EMPLOYEE accounts (staff: ask an administrator) |
| `employees/[id]/self-service-access-card.tsx` (new) + `page.tsx` | "Self-service access" card for `employee-user.read`: StatusPill + email (`<bdi dir=ltr>`) + password set/not; Invite / Resend (`employee-user.invite`), Deactivate with confirm / Reactivate (`employee-user.update`); re-reads when the record's termination state changes |
| `lib/status-tone.ts` | `user.invited → info` |
| `messages/{en,ar}.json` | `auth.forgotPassword`, `auth.accountsNote` (reworded), `account.*`, `selfServiceAccess.*` |

### Two decisions made while building (stated)

1. **Server refusals are MAPPED to translated text, not shown raw.** The card proposed showing
   the server's message inline; but no screen in the app shows raw API messages (grep: zero
   `err.message` in `app/`), and they are English-only — Arabic users would have read English.
   The six refusals SS-06a defines map to `selfServiceAccess.refusal.*`; anything else falls back
   to a translated generic line.
2. **Links are styled with `buttonVariants`, not `<Button render={<Link/>}>`** — Base UI's Button
   is a real `<button>`; rendering an anchor through it would put button semantics on a link.

## Bugs caught while verifying

1. **The language switcher killed the link.** The page strips the token from the address bar
   (by design) — so the switcher then pointed at `/ar/account/set-password` with no token, and
   switching language before submitting landed on a dead page. Measured in the accessibility
   tree (`link "العربية" href="/ar/account/set-password"`). Fixed: the token is also kept in
   **sessionStorage** (this tab only; not localStorage, which would outlive the tab and reach
   others) and cleared the moment it is used or refused. Re-verified: en → switch → ar keeps the
   form; after the (used-token) submit the stored copy is gone.
2. **The login's new link added 2px.** First re-measure: every element 8–9px up AND the
   email→password gap 70 instead of 68 — the link's line box grew the label row. `leading-none`
   fixed it; second re-measure below.

## Verification (dev server; browser pane)

### Login page unchanged — measured, not eyeballed

Baseline taken BEFORE the refactor, re-measured after, at 1280 and 375 in both locales:

| | email−h1 | password−email | button−password | note−button | mark | panel | widths / x |
|---|---|---|---|---|---|---|---|
| before | 100 | 68 | 48 | 56 | same | same | 320 / same |
| after | **100** | **68** | **48** | **56** | **identical** | **identical** | **identical** |

The only difference is a **uniform −8px** shift of the centred block — exactly half of the 16px
the reworded accounts note added by wrapping to a second line (an intended copy change). 0px
overflow in all four.

### The full loop, through the UI

1. HR (hr_officer) opens Mohammed Alabdullah's record → card "No self-service account… [Invite]"
   → Invite → dialog → `ss06b-live@example.com` → **Send invitation** → card: **Invited**,
   email, "Not set yet", "Invitation sent to …", buttons now *Resend invitation* · *Deactivate*.
   Dev log: `email → ss06b-live@example.com: دعوة إلى ملفك في PEOPLE&GRO`.
2. **Token for the browser test.** The capture logs only the subject and the DB stores only the
   hash, so a test token was minted the way `AccountTokensService` does: older invite expired,
   `sha256(raw)` inserted (dev only; the raw value lived in a scratch file, deleted afterwards).
3. `/ar/account/set-password#token=…` → address bar becomes `/ar/account/set-password` (no
   fragment), `meta referrer = no-referrer`, RTL, one h1, inputs `autocomplete=new-password`.
4. `short` / `short` → «استخدم 10 أحرف على الأقل.» (`role=alert`, `aria-invalid`,
   `aria-describedby=password-error`); mismatched → «كلمتا المرور غير متطابقتين.»; matching →
   **«تم تعيين كلمة المرور»** with a sign-in link.
5. Sign-in link → login form → typed email + password → **signed in as `principalType:
   employee`, `employeeId` = Mohammed's record**, permissions `session.end, self-service.read,
   self-service.create`, landing `/ar/today` (the empty staff shell — SS-07's job, as the card
   stated).
6. **Used link**: same token again, switch en→ar (form kept), submit → «لا يمكن استخدام هذا
   الرابط» + link to forgot-password; stored token cleared. (The page cannot tell a used link
   from a good one before submitting — there is deliberately no "check this token" endpoint,
   which would be one more way to probe tokens.)

### Forgot password

Typed (real keystrokes) the active account's address and an unknown address: the page text is
**character-identical** for both; the database shows **one `reset` token for the real account
and none for the unknown**.

*A measurement discarded:* a first attempt set the field's value programmatically inside an
iframe; React never saw it, both requests went out with an empty email, and neither produced a
token — which looked like a defect. Re-done with real typing on the page; the result above.

### The card

| Check | Result |
|---|---|
| active account (ar) | «نشط», email, «معيّنة»; only *Deactivate* offered (an active account cannot be re-invited) |
| Deactivate | confirm shown once («إيقاف هذا الحساب؟ سيُسجَّل خروج الموظف من كل الأجهزة فورًا.»); pill → «موقوف», neutral tone; *Reactivate* offered |
| Reactivate | no confirm; back to «نشط», ok tone |
| refusal, company not opted in (client-B employee, ar) | dialog stays open with «الخدمة الذاتية غير مفعّلة لشركة هذا الموظف.» |
| recruiter (`employee.read`, no `employee-user.*`) | record renders (Core / Salary / Government), **no card, 0 `/employee-accounts` requests** |

### Layout sweep

- login · set-password (form) · set-password (invalid) · forgot-password × en/ar × 1280/375 =
  **16/16**: 0px overflow, one h1, correct `dir`.
- employee record with the card × en/ar × 1280/375: 0px overflow each.

### Gates

`@hr/web` typecheck + lint clean; `pnpm --filter @hr/web build` succeeded (dev server stopped
first) with `/[locale]/account/set-password` and `/forgot-password` prerendered for ar/en.

### Cleanup

The test account (tokens cascade) and the client-A flag row deleted; one employee account
remains — the seed's.

## Found, not fixed (for SS-07)

- An employee who signs in lands on `/today` — the staff shell — where `roles.employee` /
  `today.role.employee` have **no translation** (`MISSING_MESSAGE` in the console). SS-07 gives
  employees their own landing, nav and labels.
