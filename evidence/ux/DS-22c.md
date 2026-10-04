# DS-22c — Google Calendar → Settings; "Other tools" removed — Evidence

- Date: 2026-10-04
- Task card: `BACKLOG.md` → DS-22c (DS epic, ADR-012)
- Status: done
- Commit: `DS-22c: Google Calendar moves into Settings; the Other tools nav group is gone`
- Scope: `apps/web` only. **No API change.**

## Owner decision (with DS-22)

Google Calendar → **Settings → System → Integrations**.

## What changed

| File | Change |
|---|---|
| `settings/google-calendar.tsx` | **Moved from `integrations/page.tsx`** (`git mv`, so it keeps its history) as `GoogleCalendarSection`: the invitations table, **Schedule invitation**, and **"What leaves the system"**, unchanged in behaviour. Its page header became a section heading (`h2`) |
| `settings/page.tsx` | The System tab now also shows for `integration.google-calendar` holders. **Label:** "System" when the person holds any system setting (Administrator); otherwise **"Integrations"**, which is the HR and GRO officers' case, and they see only that section. `?tab=prefs` / `?tab=system` preset the tab, the latter only when the person can see it |
| `integrations/page.tsx` | Now a redirect to `/settings?tab=system` |
| `app-nav.tsx` | **The "Other tools" group is gone.** The staff nav is now exactly the prototype's **Workspace** plus **Saved views**. The Workspace comment is updated (every row opens its prototype screen) |
| `header-location.tsx`, messages | `/integrations` crumb and `nav.otherTools` / `nav.integrations` removed; `settings.tab.integrations` added |

**The card's open risk, resolved:** for someone who holds only the calendar permission, a tab called "System" would have described nothing they can do. It reads "Integrations" for them. The Administrator still sees "System".

## Live verification (web restarted)

**HR officer:**
- **Nav:** Overview · Calendar · Work queue · Requests · Leaves · People · Hiring · Clients, under **Workspace** and **Saved views** only.
- **Redirect:** `/en/integrations` → `/en/settings?tab=system`. Tabs: Access · Preferences · **Integrations*** (selected), containing only "Google Calendar invitations".
- **Schedule invitation:** Interview, reference DS22C-001, "Test Candidate", Accountant, 12 Oct 10:00–10:45, Riyadh office, attendee `panel@example.test`. The dev capture client stood in for Google, so nothing was sent. It listed as "DS22C-001 · Interview — Test Candidate — Accountant · Scheduled".
- **What leaves:** Title "Interview — Test Candidate — Accountant", Description "Ref: DS22C-001", start, end, location, attendee, and the external id `gcal-dev-…`. This equals the stored `int_gcal_invitations.payload`, field for field.
- The test invitation was deleted afterwards (0 rows).

**Other roles (MFA temporary, cleared afterwards: 0 enrolled):**

| Role | Tabs | System / Integrations sections |
|---|---|---|
| Administrator | Access · Preferences · **System** | Document expiry · System settings · Feature flags · Per-client settings · Google Calendar invitations |
| Auditor | Access · Preferences | none. `?tab=system` falls back to Access, since the Auditor holds none of those permissions |

**Layout and locales:** HR officer at `/settings?tab=system`, `/ar` and `/en` × 1280 and 375 — 0px page overflow, one `h1`, no raw keys. Arabic «الوصول / التفضيلات / التكاملات», section «دعوات تقويم Google».

**Gates:**
- Web typecheck and lint clean; prettier clean.
- One self-inflicted parse error while moving the file (a closing tag swapped in the wrong component) was caught by typecheck and fixed before verification.
- **`next build` succeeds**: `/[locale]/settings` 12.8 kB; `/integrations` 314 B (redirect only).

## Found, not fixed (pre-existing since GCAL-03; the code moved unchanged)

- **The invitation time is read in the browser's timezone, not the one chosen.** I entered 10:00 with timezone "Asia/Riyadh", but the form converts with `new Date(datetime-local)`, which uses the *browser's* zone. This browser is UTC+4, so it sent `06:00Z`: **09:00 in Riyadh, an hour early**. It's correct whenever the browser's zone equals the chosen one, which is the normal case in Saudi Arabia. Filed as **GCAL-04**.
