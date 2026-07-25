import { Inject, Injectable } from '@nestjs/common';
import {
  GOOGLE_CALENDAR_CLIENT,
  type CalendarInvitation,
  type GoogleCalendarClient,
  type GoogleEventPayload,
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

  // Returns the whitelisted payload it sent, so callers can persist EXACTLY what left
  // the system without ever building a payload themselves (ADR-009: only the adapter builds).
  async createInvitation(
    invitation: CalendarInvitation,
  ): Promise<{ externalEventId: string; payload: GoogleEventPayload }> {
    const payload = buildGoogleEventPayload(invitation);
    const { externalEventId } = await this.client.create(payload);
    return { externalEventId, payload };
  }

  async updateInvitation(
    externalEventId: string,
    invitation: CalendarInvitation,
  ): Promise<GoogleEventPayload> {
    const payload = buildGoogleEventPayload(invitation);
    await this.client.update(externalEventId, payload);
    return payload;
  }

  cancelInvitation(externalEventId: string): Promise<void> {
    return this.client.cancel(externalEventId);
  }
}
