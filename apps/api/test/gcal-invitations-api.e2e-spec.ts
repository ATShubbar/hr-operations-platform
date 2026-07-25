import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { CaptureGoogleCalendarClient } from '../src/modules/integrations/public-api';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// GCAL-02: the Google Calendar invitations API (ADR-009). Staff schedule outbound
// invitations; the service sends via the adapter (the only path to Google) and
// persists the record + the exact whitelisted payload. Clients have no access;
// Finance/Read-Only lack the permission.

describe('Google Calendar invitations API (GCAL-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let capture: CaptureGoogleCalendarClient;
  let recruiter: TestPrincipal; // integration.google-calendar
  let finance: TestPrincipal; // no integration permission
  let repClient: string;
  let rep: TestPrincipal; // client rep — no access
  let invId = '';
  let externalEventId = '';

  const BODY = {
    kind: 'interview',
    start: '2026-08-10T09:00:00Z',
    end: '2026-08-10T10:00:00Z',
    timezone: 'Asia/Riyadh',
    personName: 'Ahmed Al-Qahtani',
    jobTitle: 'Senior Accountant',
    referenceCode: 'REC-2026-9001',
    attendeeEmails: ['recruiter@firm.example', 'ahmed@example.com'],
  };
  const post = (cookie: string, body: object) =>
    request(http).post('/integrations/google-calendar/invitations').set('Cookie', cookie).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    capture = app.get(CaptureGoogleCalendarClient);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة التكامل', nameEn: 'GCAL Client', status: 'active' },
    });
    repClient = c.id;
    recruiter = await loginAsStaff(app, 'recruiter');
    finance = await loginAsStaff(app, 'finance');
    rep = await loginAsClientRep(app, repClient, 'client_admin');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'gcal-invitation' } });
    await owner.gcalInvitation.deleteMany({ where: { referenceCode: { startsWith: 'REC-2026-90' } } });
    await cleanupHelperUsers(app);
    await owner.client.delete({ where: { id: repClient } });
    await owner.$disconnect();
    await app.close();
  });

  it('a recruiter schedules an invitation — sent via the adapter + persisted with the whitelisted payload', async () => {
    const res = await post(recruiter.cookie, BODY).expect(201);
    expect(res.body.externalEventId).toMatch(/^gcal-dev-/);
    expect(res.body.status).toBe('scheduled');
    // the response surfaces EXACTLY what left the system
    expect(res.body.payload.summary).toBe('Interview — Ahmed Al-Qahtani — Senior Accountant');
    expect(res.body.payload.description).toBe('Ref: REC-2026-9001');
    // payload contains only whitelisted keys
    for (const k of Object.keys(res.body.payload)) {
      expect(['summary', 'description', 'start', 'end', 'location', 'attendees']).toContain(k);
    }
    invId = res.body.id;
    externalEventId = res.body.externalEventId;

    // the adapter actually captured the outbound payload
    expect(capture.created.some((c) => c.externalEventId === externalEventId)).toBe(true);
  });

  it('lists invitations', async () => {
    const res = await request(http)
      .get('/integrations/google-calendar/invitations')
      .set('Cookie', recruiter.cookie)
      .expect(200);
    expect(res.body.invitations.some((i: { id: string }) => i.id === invId)).toBe(true);
  });

  it('updates an invitation — re-sends to the adapter with the external id', async () => {
    const res = await request(http)
      .patch(`/integrations/google-calendar/invitations/${invId}`)
      .set('Cookie', recruiter.cookie)
      .send({ ...BODY, jobTitle: 'Finance Manager' })
      .expect(200);
    expect(res.body.payload.summary).toBe('Interview — Ahmed Al-Qahtani — Finance Manager');
    expect(capture.updated.some((u) => u.externalEventId === externalEventId)).toBe(true);
  });

  it('cancels an invitation — cancels the Google event and marks it cancelled', async () => {
    const res = await request(http)
      .delete(`/integrations/google-calendar/invitations/${invId}`)
      .set('Cookie', recruiter.cookie)
      .expect(200);
    expect(res.body.status).toBe('cancelled');
    expect(capture.cancelled).toContain(externalEventId);
  });

  it('validates the whitelisted contract (bad email → 400)', async () => {
    await post(recruiter.cookie, { ...BODY, referenceCode: 'REC-2026-9002', attendeeEmails: ['not-an-email'] }).expect(400);
  });

  it('Finance staff lack the permission (403)', async () => {
    await post(finance.cookie, { ...BODY, referenceCode: 'REC-2026-9003' }).expect(403);
  });

  it('a client rep has no access (403); unauth → 401', async () => {
    await request(http).get('/integrations/google-calendar/invitations').set('Cookie', rep.cookie).expect(403);
    await request(http).get('/integrations/google-calendar/invitations').expect(401);
  });
});
