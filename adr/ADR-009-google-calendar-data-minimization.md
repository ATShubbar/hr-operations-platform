# ADR-009 — Google Calendar integration with data minimization

- Status: Accepted
- Date: 2026-07-18 (rev. 1, same day: product decision widened the whitelist — names, titles, and attachments permitted; government identifiers and compensation data remain prohibited)
- Owner: TBD

## Context
v1 includes Google Calendar for interview scheduling and meeting invitations. Google infrastructure is outside KSA, and the platform's residency/PDPL principle forbids sending customer personal data abroad. The integration is genuinely useful (invites must reach staff and candidates), so the tension must be resolved by design rather than by dropping the feature or ignoring the principle.

## Options considered
1. **Full two-way sync of calendar events with details.** Best UX, sends names, roles, and context to Google — violates the residency principle. Rejected.
2. **No integration.** Compliant, but loses real scheduling value; staff would shadow-schedule in Google anyway, unmanaged. Rejected.
3. **Outbound-only, adapter-enforced minimized payloads.** Send only what an invitation needs to function; everything else stays in the platform, referenced by code.

## Decision
Option 3:
- **Whitelist (the only data that may leave):** start/end time and timezone; event title and description — participant names, job titles, and meeting titles permitted, alongside the internal reference code for traceability; location or meeting link; attendee emails — staff, and the candidate's when the invitation itself requires it; attachments needed for the meeting itself (e.g., a CV for the interview panel).
- **Prohibited in any payload:** government identifiers (iqama, passport, national ID, border numbers) and salary/compensation/offer terms — whether in text fields or inside attachments.
- **Structural enforcement:** the Integrations adapter is the only code path to Google and constructs payloads itself from typed inputs — modules cannot compose payloads, so minimization is not a convention callers must remember.
- **Direction:** outbound create/update/cancel only; no inbound sync of external calendar content.
- The calendar event is a pointer; the interview record in the platform is the source of truth.

## Consequences
- Calendar entries are readable at a glance (names and titles included); full records still live only in the platform, linked by reference code.
- Attachments can carry hidden data — the adapter must reject attachments whose source records are flagged as containing government identifiers or compensation data, not just filter text fields.
- Any new outbound field requires editing the adapter's whitelist — a deliberate, reviewable act (and a PDPL question, not just a code change).
- The same adapter pattern becomes the template for every future external integration's residency review.
- If two-way sync is ever demanded, that is a new ADR with a legal review attached.

## Links
- `architecture.md` — Integrations
- ADR-005 (localized event text), `ACTION-PLAN.md` 5.3, 0.9 (PDPL review)
