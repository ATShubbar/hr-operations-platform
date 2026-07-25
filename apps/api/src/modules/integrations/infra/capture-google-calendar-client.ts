import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  GOOGLE_CALENDAR_CLIENT,
  type GoogleCalendarClient,
  type GoogleEventPayload,
} from '../domain/calendar-invitation';

// Dev/interim Google Calendar client (GCAL-01). NOT a real Google connection — it
// records every outbound payload (and logs it), so "exactly what would leave the
// system" is inspectable in dev and CI without touching Google. Production binds a
// real client (googleapis over the service account) to GOOGLE_CALENDAR_CLIENT
// instead; nothing else changes. Same seam pattern as the email transport.
export interface CapturedGoogleEvent {
  externalEventId: string;
  payload: GoogleEventPayload;
}

@Injectable()
export class CaptureGoogleCalendarClient implements GoogleCalendarClient {
  private readonly logger = new Logger(CaptureGoogleCalendarClient.name);
  readonly created: CapturedGoogleEvent[] = [];
  readonly updated: CapturedGoogleEvent[] = [];
  readonly cancelled: string[] = [];

  async create(payload: GoogleEventPayload): Promise<{ externalEventId: string }> {
    const externalEventId = `gcal-dev-${randomUUID()}`;
    this.created.push({ externalEventId, payload });
    this.logger.log(`google-calendar create → ${externalEventId}: ${payload.summary}`);
    return { externalEventId };
  }

  async update(externalEventId: string, payload: GoogleEventPayload): Promise<void> {
    this.updated.push({ externalEventId, payload });
    this.logger.log(`google-calendar update → ${externalEventId}: ${payload.summary}`);
  }

  async cancel(externalEventId: string): Promise<void> {
    this.cancelled.push(externalEventId);
    this.logger.log(`google-calendar cancel → ${externalEventId}`);
  }

  // Test helper: the most recently captured created event.
  last(): CapturedGoogleEvent | undefined {
    return this.created[this.created.length - 1];
  }
}

// Provider binding — swap useClass for the real Google client in production.
export const captureGoogleCalendarClientProvider = {
  provide: GOOGLE_CALENDAR_CLIENT,
  useExisting: CaptureGoogleCalendarClient,
};
