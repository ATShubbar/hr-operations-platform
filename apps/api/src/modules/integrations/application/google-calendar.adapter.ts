import { Inject, Injectable } from '@nestjs/common';
import {
  GOOGLE_CALENDAR_CLIENT,
  type CalendarInvitation,
  type GoogleCalendarClient,
} from '../domain/calendar-invitation';
import { buildGoogleEventPayload } from '../domain/invitation-payload';

// The Google Calendar adapter (GCAL-01, ADR-009). The ONLY code path to Google:
// modules pass a typed CalendarInvitation, the adapter builds the whitelisted
// payload (via the pure builder) and hands it to the bound client. Callers never
// compose a payload, so data-minimization is structural. Outbound only.
@Injectable()
export class GoogleCalendarAdapter {
  constructor(
    @Inject(GOOGLE_CALENDAR_CLIENT) private readonly client: GoogleCalendarClient,
  ) {}

  createInvitation(invitation: CalendarInvitation): Promise<{ externalEventId: string }> {
    return this.client.create(buildGoogleEventPayload(invitation));
  }

  updateInvitation(externalEventId: string, invitation: CalendarInvitation): Promise<void> {
    return this.client.update(externalEventId, buildGoogleEventPayload(invitation));
  }

  cancelInvitation(externalEventId: string): Promise<void> {
    return this.client.cancel(externalEventId);
  }
}
