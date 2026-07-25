import { Module } from '@nestjs/common';
import { GoogleCalendarAdapter } from './application/google-calendar.adapter';
import {
  CaptureGoogleCalendarClient,
  captureGoogleCalendarClientProvider,
} from './infra/capture-google-calendar-client';

// Integrations module (ACTION-PLAN 5.3; architecture.md Integrations; ADR-009). Holds
// the adapters that are the ONLY code paths to external services — starting with the
// Google Calendar adapter, whose typed input + whitelisted payload builder make data-
// minimization structural. The concrete client is a dev CAPTURE here (records outbound
// payloads); production binds a real client to GOOGLE_CALENDAR_CLIENT. GCAL-02 adds the
// persisted, audited HTTP surface.
@Module({
  providers: [
    GoogleCalendarAdapter,
    CaptureGoogleCalendarClient,
    captureGoogleCalendarClientProvider,
  ],
  exports: [GoogleCalendarAdapter, CaptureGoogleCalendarClient],
})
export class IntegrationsModule {}
