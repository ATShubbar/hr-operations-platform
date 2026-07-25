# GCAL-01 — Integrations module + Google Calendar adapter (structural minimization) — Evidence

- Date: 2026-07-25
- Task card: `BACKLOG.md` → GCAL-01 (ACTION-PLAN 5.3, ADR-009)
- Status: done
- Commit: `GCAL-01: integrations module + Google Calendar adapter (structural PII minimization)`

## What shipped

The ADR-009 core — the adapter that is the SOLE code path to Google, building a
whitelisted payload from a typed invitation over a pluggable dev-capture client. No
HTTP/persistence yet (those land with GCAL-02).

- **`modules/integrations`** — a new module holding the external-service adapters.
- **Typed input** (`domain/calendar-invitation.ts`) — `CalendarInvitation` carries
  only structured fields: kind (interview/meeting), start/end/timezone, `personName`/
  `jobTitle`/`meetingTitle` (structured summary parts), `referenceCode`, location/
  meetingLink, attendee emails. **There is no free-form payload and no field for a
  government identifier or salary** — so those cannot leave through this path, by
  construction.
- **The whitelist** (`GoogleEventPayload`) — the only shape that leaves: summary,
  description, start, end, location?, attendees. No key for identifiers/compensation.
- **The pure builder** (`domain/invitation-payload.ts`, `buildGoogleEventPayload`) —
  the ONLY constructor of a Google payload. Formats the title from the structured
  parts (`Interview — <name> — <role>`, or the meeting subject) and the description
  as `Ref: <code>`; the caller never composes the text.
- **The seam** — `GOOGLE_CALENDAR_CLIENT` token + `GoogleCalendarClient` interface
  (create/update/cancel) + `CaptureGoogleCalendarClient` (dev impl — records every
  outbound payload, mints `gcal-dev-<uuid>` ids). Production binds a real client;
  nothing else changes. Same seam pattern as the email transport / document scanner.
- **The adapter** (`GoogleCalendarAdapter`) — `createInvitation` / `updateInvitation`
  / `cancelInvitation`: builds the payload, calls the client. The only code that
  constructs a Google payload.

## Structural minimization — how it's enforced

The `CalendarInvitation` type has no field for an iqama/passport/national-id/border
number or salary/offer terms, and the builder reads only whitelisted fields, formatting
the title itself. A caller physically cannot pass those categories to Google through
this adapter — minimization is structural, not a convention (ADR-009 §Enforcement).
The test asserts the built payload's key set is **exactly** the whitelist.

## DoD check

| DoD item | Result |
|---|---|
| Interview → summary `Interview — <name> — <role>`, description carries the ref code, attendees + start/end/tz set | ✅ test 1 |
| Payload keys are EXACTLY the whitelist (no extra field) | ✅ test 1 (WHITELIST_KEYS assertion) |
| Meeting → summary from its subject | ✅ test 2 |
| `createInvitation` captures exactly the built payload + mints an external id | ✅ test 3 |
| `updateInvitation`/`cancelInvitation` reach the client with the external id | ✅ test 4 |
| Suite + lint + typecheck (6 pkgs) + build green | ✅ suite **305/305** |

## Test output (`test/google-calendar-adapter.e2e-spec.ts`, 4/4)

```
✓ builds the whitelisted payload from an interview — and ONLY the whitelist
✓ formats a meeting summary from its subject
✓ createInvitation captures exactly the built payload + mints an external id
✓ updateInvitation and cancelInvitation reach the client with the external id
```

Full suite **59 files / 305 passed** (was 301 + 4 new).

## Files

- `apps/api/src/modules/integrations/{integrations.module.ts, public-api.ts}`
- `.../domain/{calendar-invitation.ts, invitation-payload.ts}`
- `.../application/google-calendar.adapter.ts` · `.../infra/capture-google-calendar-client.ts`
- `apps/api/src/app.module.ts` (register IntegrationsModule)
- `apps/api/test/google-calendar-adapter.e2e-spec.ts`

## Deferred (per ADR-009)

- **Attachments** — ADR-009 requires the adapter to reject attachments whose source
  records are flagged with identifiers/compensation; that guard belongs with a real
  client, so v1 GCAL-01 has no attachment field (noted).
- **The real Google client** — bound at `GOOGLE_CALENDAR_CLIENT` in production (infra).

## Next (GCAL-02)

Persist + HTTP — `int_gcal_invitations` (externalEventId, referenceCode, status) +
`POST/PATCH/DELETE /integrations/google-calendar/invitations` (typed contract,
`integration.google-calendar` permission, audited) → create/update/cancel via the adapter.
