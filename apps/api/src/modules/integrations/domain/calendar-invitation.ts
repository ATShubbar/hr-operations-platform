// The Google Calendar integration's typed surface (GCAL-01, ADR-009). Data
// minimization is STRUCTURAL: a caller supplies these typed fields and nothing
// else — there is no free-form payload and NO field for a government identifier
// (iqama/passport/national-id/border) or salary/compensation. The adapter formats
// the outbound title/description from the structured parts, so those categories
// cannot leave the system through this path by construction.

export type InvitationKind = 'interview' | 'meeting';

export interface CalendarInvitation {
  kind: InvitationKind;
  start: Date;
  end: Date;
  timezone: string; // IANA tz, e.g. 'Asia/Riyadh'
  // Structured summary parts — the adapter builds the title from these; the caller
  // never composes the title/description text itself.
  personName?: string | null; // interview participant (name + role are permitted)
  jobTitle?: string | null; // the role the interview is for
  meetingTitle?: string | null; // a meeting's subject
  referenceCode: string; // internal link-back; the platform record is the source of truth
  location?: string | null;
  meetingLink?: string | null;
  attendeeEmails: readonly string[]; // staff, and the candidate's when the invite needs it
}

// The ONLY shape that leaves the system — the ADR-009 field whitelist. There is no
// key here for identifiers or compensation; the adapter builds exactly this.
export interface GoogleEventPayload {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: string;
  attendees: readonly { email: string }[];
}

// The seam to Google (GCAL-01). The adapter depends on this interface, never a
// concrete client — a dev CAPTURE client here, a real Google API client in
// production (deferred to infra), same pattern as the email transport / document
// scanner. Outbound only: create / update / cancel.
export interface GoogleCalendarClient {
  create(payload: GoogleEventPayload): Promise<{ externalEventId: string }>;
  update(externalEventId: string, payload: GoogleEventPayload): Promise<void>;
  cancel(externalEventId: string): Promise<void>;
}

export const GOOGLE_CALENDAR_CLIENT = Symbol('GOOGLE_CALENDAR_CLIENT');
