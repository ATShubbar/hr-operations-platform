import type { CalendarInvitation, GoogleEventPayload } from './calendar-invitation';

// The ONLY function that builds a Google payload (GCAL-01, ADR-009). It reads only
// whitelisted fields of a typed CalendarInvitation and formats the title/description
// itself — so government identifiers and compensation data cannot leave the system
// through this path, structurally (there is no field to carry them, and no free-form
// text the caller controls). Pure: no I/O, deterministic.

// The event title, built from the structured parts. Interview → "Interview — <name>
// — <role>" (whichever parts are present); meeting → its subject.
function buildSummary(inv: CalendarInvitation): string {
  if (inv.kind === 'interview') {
    const parts = ['Interview', inv.personName, inv.jobTitle].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    return parts.join(' — ');
  }
  return inv.meetingTitle && inv.meetingTitle.length > 0 ? inv.meetingTitle : 'Meeting';
}

export function buildGoogleEventPayload(inv: CalendarInvitation): GoogleEventPayload {
  // The reference code is the link-back; the full record stays in the platform.
  const description = `Ref: ${inv.referenceCode}`;
  // A physical location wins; otherwise a video link occupies the location slot.
  const location = inv.location ?? inv.meetingLink ?? undefined;

  return {
    summary: buildSummary(inv),
    description,
    start: { dateTime: inv.start.toISOString(), timeZone: inv.timezone },
    end: { dateTime: inv.end.toISOString(), timeZone: inv.timezone },
    ...(location ? { location } : {}),
    attendees: inv.attendeeEmails.map((email) => ({ email })),
  };
}
