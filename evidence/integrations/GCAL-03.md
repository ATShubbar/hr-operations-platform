# GCAL-03 — Google Calendar invitations web UI (schedule + transparency view) — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → GCAL-03 (ACTION-PLAN 5.3, ADR-009)
- Status: done
- Commit: `GCAL-03: Google Calendar invitations web UI — schedule + what-leaves transparency view`

## What shipped

The staff web surface over the GCAL-02 API, closing the epic. Front-end only.

- **Invitations console** (`(app)/integrations/page.tsx`, nav-gated
  `integration.google-calendar`) — a table (reference · type · title · start ·
  status) + a **guardrail banner** stating exactly which fields leave and that
  government identifiers / compensation never do.
- **Schedule** dialog — a typed form (kind interview/meeting; reference code;
  interview → participant name + job title, meeting → subject; start/end; timezone;
  location; attendee emails) → `POST …/invitations`. Attendee emails split on
  comma/newline.
- **The transparency view** ("What leaves the system") — a per-invitation dialog
  showing EXACTLY the whitelisted payload that was sent (title, description, start/
  end + timezone, location, attendees, external event id) with the note that the
  full record stays in the platform, linked by reference code — the ADR-009
  transparency the whole design exists to make visible.
- **Cancel** — `DELETE …/:id` (marks the invitation cancelled).
- **Shell** — a "Google Calendar" nav link gated on `integration.google-calendar`;
  `nav.integrations` + a full `integrations.*` block in en + ar.

## Browser verification (live, dev servers on API :3001 / web :58118)

Logged in as the seeded recruiter (`staff-recruiter@seed.hr.local`).

| DoD item | Result |
|---|---|
| "Google Calendar" nav visible (recruiter holds the permission); guardrail banner shown | ✅ nav + banner |
| **Schedule an interview through the UI** | ✅ created "REC-DEMO-1"; row appeared |
| **The "What leaves" view shows exactly the whitelisted payload** | ✅ Title `Interview — Ahmed Al-Qahtani — Senior Accountant`, Description `Ref: REC-DEMO-1`, start/end + Asia/Riyadh, attendees, `gcal-dev-…` id — nothing else |
| Persisted end-to-end (adapter → DB) | ✅ `int_gcal_invitations`: REC-DEMO-1, interview, scheduled, external id, summary matches |
| Both locales | ✅ en (LTR) + ar (RTL — guardrail banner in Arabic, dual-calendar start, sidebar right) |
| No console errors | ✅ error level: none |

The verification invitation + its audit row were removed afterward.

## Static checks

```
pnpm --filter @hr/web typecheck   # tsc --noEmit — clean
pnpm --filter @hr/web lint         # eslint src — clean (logical-only utilities, RTL)
messages/en.json + ar.json          # both parse; no missing-key warnings
```

## Files

- `apps/web/src/app/[locale]/(app)/integrations/page.tsx` (NEW)
- `apps/web/src/components/app-shell.tsx` (Google Calendar nav link, `integration.google-calendar`-gated)
- `apps/web/messages/{en,ar}.json` (`nav.integrations` + `integrations.*`)

## Epic status

**Google Calendar epic (5.3) COMPLETE** — GCAL-01 (adapter + structural minimization),
GCAL-02 (persisted, audited API), GCAL-03 (web UI + transparency view). Sixteen product
screens now. The real Google client (bound at `GOOGLE_CALENDAR_CLIENT`) and attachments
(with the identifier/compensation guard) remain deferred to infra, per ADR-009.
