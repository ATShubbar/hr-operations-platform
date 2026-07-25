// Public surface of the integrations module (ADR-003; ACTION-PLAN 5.3, ADR-009).
export { IntegrationsModule } from './integrations.module';
export { GoogleCalendarAdapter } from './application/google-calendar.adapter';
export { buildGoogleEventPayload } from './domain/invitation-payload';
export {
  GOOGLE_CALENDAR_CLIENT,
  type CalendarInvitation,
  type InvitationKind,
  type GoogleEventPayload,
  type GoogleCalendarClient,
} from './domain/calendar-invitation';
// The dev capture client (exported so tests + a dev inspection surface can read the
// outbound payloads); production swaps in a real client at the DI token.
export {
  CaptureGoogleCalendarClient,
  type CapturedGoogleEvent,
} from './infra/capture-google-calendar-client';
