import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// CAL-02: the Calendar API. Events are own-scoped (calendar.read-all lifts it);
// delete is Company-Admin-only; clients have no access. The /calendar/view endpoint
// merges own events with ACTIVE Tasks/Requests/GRO deadlines, each gated by its read
// permission (a Recruiter's view omits GRO — no gro.read).

describe('Calendar API (CAL-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let admin: TestPrincipal; // company_admin — read-all + delete
  let hr: TestPrincipal; // hr_officer — CRU own, no delete/read-all
  let finance: TestPrincipal; // another staff — own-scope probe
  let recruiter: TestPrincipal; // no gro.read (view omits GRO)
  let rep: TestPrincipal; // client rep — no calendar access
  let clientId: string;
  let empId: string;
  let hrEventId = '';

  const RANGE = '?from=2026-08-01&to=2026-09-01';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة التقويم', nameEn: 'CAL-02 Client', status: 'active' },
    });
    clientId = c.id;
    const e = await owner.employee.create({
      data: { clientId, nameAr: 'م', nameEn: 'Emp', nationality: 'SA', contractType: 'unlimited' },
    });
    empId = e.id;

    admin = await loginAsEnrolledStaff(app, 'company_admin');
    hr = await loginAsStaff(app, 'hr_officer');
    finance = await loginAsStaff(app, 'finance');
    recruiter = await loginAsStaff(app, 'recruiter');
    rep = await loginAsClientRep(app, clientId, 'client_admin');

    // Deadlines in range: a task, a request, a GRO process (active) + a DONE task
    // that must be excluded. Inserted directly (owner) to avoid side effects.
    await owner.task.create({
      data: { clientId, title: 'CAL active task', status: 'open', dueDate: new Date('2026-08-12') },
    });
    await owner.task.create({
      data: { clientId, title: 'CAL done task', status: 'done', dueDate: new Date('2026-08-13') },
    });
    await owner.request.create({
      data: {
        clientId,
        type: 'gro_service',
        title: 'CAL request',
        status: 'open',
        dueDate: new Date('2026-08-15'),
        createdByUserId: hr.userId,
      },
    });
    await owner.groProcess.create({
      data: { clientId, employeeId: empId, type: 'iqama_renewal', status: 'in_progress', dueDate: new Date('2026-08-20') },
    });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.calendarEvent.deleteMany({ where: { OR: [{ clientId }, { id: hrEventId || undefined }] } });
    await owner.groProcess.deleteMany({ where: { clientId } });
    await owner.request.deleteMany({ where: { clientId } });
    await owner.task.deleteMany({ where: { clientId } });
    await owner.employee.deleteMany({ where: { id: empId } });
    await cleanupHelperUsers(app);
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('hr_officer creates an event (owner = self)', async () => {
    const res = await request(http)
      .post('/calendar/events')
      .set('Cookie', hr.cookie)
      .send({ title: 'Team sync', startAt: '2026-08-10T09:00:00Z', endAt: '2026-08-10T10:00:00Z' })
      .expect(201);
    expect(res.body.ownerUserId).toBe(hr.userId);
    hrEventId = res.body.id;
  });

  it('own-scope: another staff cannot fetch hr_officer event (404); read-all can', async () => {
    await request(http).get(`/calendar/events/${hrEventId}`).set('Cookie', finance.cookie).expect(404);
    const seen = await request(http).get(`/calendar/events/${hrEventId}`).set('Cookie', admin.cookie).expect(200);
    expect(seen.body.id).toBe(hrEventId);
  });

  it('delete is Company-Admin-only (hr_officer → 403)', async () => {
    await request(http).delete(`/calendar/events/${hrEventId}`).set('Cookie', hr.cookie).expect(403);
  });

  it('a client rep has no calendar access (403)', async () => {
    await request(http).get('/calendar/events').set('Cookie', rep.cookie).expect(403);
    await request(http).get(`/calendar/view${RANGE}`).set('Cookie', rep.cookie).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/calendar/events').expect(401);
  });

  it('the view merges own events + active Task/Request/GRO deadlines (done excluded)', async () => {
    const res = await request(http).get(`/calendar/view${RANGE}`).set('Cookie', admin.cookie).expect(200);
    const kinds = new Set(res.body.items.map((i: { kind: string }) => i.kind));
    expect(kinds.has('task')).toBe(true);
    expect(kinds.has('request')).toBe(true);
    expect(kinds.has('gro')).toBe(true);
    const titles = res.body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('CAL active task');
    expect(titles).not.toContain('CAL done task'); // terminal excluded
  });

  it("a recruiter's view omits GRO (no gro.read) but includes requests", async () => {
    const res = await request(http).get(`/calendar/view${RANGE}`).set('Cookie', recruiter.cookie).expect(200);
    const kinds = new Set(res.body.items.map((i: { kind: string }) => i.kind));
    expect(kinds.has('gro')).toBe(false);
    expect(kinds.has('request')).toBe(true);
  });

  it('the view requires from and to (400)', async () => {
    await request(http).get('/calendar/view').set('Cookie', admin.cookie).expect(400);
  });
});
