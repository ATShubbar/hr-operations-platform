import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  buildGoogleEventPayload,
  CaptureGoogleCalendarClient,
  GoogleCalendarAdapter,
  type CalendarInvitation,
} from '../src/modules/integrations/public-api';

// GCAL-01: the Google Calendar adapter (ADR-009). Data minimization is structural —
// the adapter builds a whitelisted payload from a typed invitation, and there is no
// field through which a government identifier or salary could travel. The dev capture
// client makes "exactly what would leave the system" inspectable.

// The complete set of keys ADR-009 permits to leave the system.
const WHITELIST_KEYS = new Set(['summary', 'description', 'start', 'end', 'location', 'attendees']);

const INTERVIEW: CalendarInvitation = {
  kind: 'interview',
  start: new Date('2026-08-10T09:00:00Z'),
  end: new Date('2026-08-10T10:00:00Z'),
  timezone: 'Asia/Riyadh',
  personName: 'Ahmed Al-Qahtani',
  jobTitle: 'Senior Accountant',
  referenceCode: 'REC-2026-0042',
  meetingLink: 'https://meet.example.com/abc',
  attendeeEmails: ['recruiter@firm.example', 'ahmed@example.com'],
};

describe('Google Calendar adapter (GCAL-01, e2e)', () => {
  let app: INestApplication;
  let adapter: GoogleCalendarAdapter;
  let capture: CaptureGoogleCalendarClient;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    adapter = app.get(GoogleCalendarAdapter);
    capture = app.get(CaptureGoogleCalendarClient);
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds the whitelisted payload from an interview — and ONLY the whitelist', () => {
    const payload = buildGoogleEventPayload(INTERVIEW);
    // exactly the ADR-009 whitelist keys — no extra field can be present
    for (const key of Object.keys(payload)) expect(WHITELIST_KEYS.has(key)).toBe(true);
    expect(payload.summary).toBe('Interview — Ahmed Al-Qahtani — Senior Accountant');
    expect(payload.description).toBe('Ref: REC-2026-0042'); // links back by reference code
    expect(payload.start).toEqual({ dateTime: '2026-08-10T09:00:00.000Z', timeZone: 'Asia/Riyadh' });
    expect(payload.location).toBe('https://meet.example.com/abc'); // link occupies the location slot
    expect(payload.attendees).toEqual([
      { email: 'recruiter@firm.example' },
      { email: 'ahmed@example.com' },
    ]);
  });

  it('formats a meeting summary from its subject', () => {
    const payload = buildGoogleEventPayload({
      kind: 'meeting',
      start: new Date('2026-08-11T12:00:00Z'),
      end: new Date('2026-08-11T13:00:00Z'),
      timezone: 'Asia/Riyadh',
      meetingTitle: 'Quarterly review — Alpha Trading',
      referenceCode: 'MTG-1',
      location: 'Riyadh office',
      attendeeEmails: ['staff@firm.example'],
    });
    expect(payload.summary).toBe('Quarterly review — Alpha Trading');
    expect(payload.location).toBe('Riyadh office');
  });

  it('createInvitation captures exactly the built payload + mints an external id', async () => {
    const { externalEventId } = await adapter.createInvitation(INTERVIEW);
    expect(externalEventId).toMatch(/^gcal-dev-/);
    const captured = capture.last();
    expect(captured?.externalEventId).toBe(externalEventId);
    expect(captured?.payload).toEqual(buildGoogleEventPayload(INTERVIEW));
  });

  it('updateInvitation and cancelInvitation reach the client with the external id', async () => {
    const { externalEventId } = await adapter.createInvitation(INTERVIEW);
    await adapter.updateInvitation(externalEventId, { ...INTERVIEW, jobTitle: 'Finance Manager' });
    expect(capture.updated.some((u) => u.externalEventId === externalEventId)).toBe(true);
    expect(capture.updated.at(-1)?.payload.summary).toBe('Interview — Ahmed Al-Qahtani — Finance Manager');

    await adapter.cancelInvitation(externalEventId);
    expect(capture.cancelled).toContain(externalEventId);
  });
});
