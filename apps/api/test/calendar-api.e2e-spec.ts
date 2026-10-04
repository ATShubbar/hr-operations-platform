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
  // v1.7 (ADR-013): every staff role reads ALL events. Administrator, HR and GRO
  // officers are CRUD (the prototype's RWCD — calendar.read-all also lifts
  // update/delete, so "write own, read all" is not expressible); the Auditor
  // reads and changes nothing.
  let admin: TestPrincipal; // administrator
  let hr: TestPrincipal; // hr_officer
  let gro: TestPrincipal; // gro_officer — CRUD on any event
  let auditor: TestPrincipal; // read-all, no writes
  let rep: TestPrincipal; // client manager — no calendar access
  let clientId: string;
  let empId: string;
  let hrEventId = '';

  const RANGE = '?from=2026-08-01&to=2026-09-01';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
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

    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    rep = await loginAsClientRep(app, clientId, 'client_manager');

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

  it('every staff role reads another staff member\'s event (read-all)', async () => {
    for (const p of [admin, gro, auditor]) {
      const seen = await request(http).get(`/calendar/events/${hrEventId}`).set('Cookie', p.cookie).expect(200);
      expect(seen.body.id).toBe(hrEventId);
    }
  });

  it('the Auditor reads but cannot create, update or delete (403)', async () => {
    await request(http)
      .post('/calendar/events')
      .set('Cookie', auditor.cookie)
      .send({ title: 'Nope', startAt: '2026-08-10T09:00:00Z', endAt: '2026-08-10T10:00:00Z' })
      .expect(403);
    await request(http)
      .patch(`/calendar/events/${hrEventId}`)
      .set('Cookie', auditor.cookie)
      .send({ title: 'Nope' })
      .expect(403);
    await request(http).delete(`/calendar/events/${hrEventId}`).set('Cookie', auditor.cookie).expect(403);
  });

  it('a GRO officer may edit and delete ANOTHER staff member\'s event (prototype RWCD)', async () => {
    await request(http)
      .patch(`/calendar/events/${hrEventId}`)
      .set('Cookie', gro.cookie)
      .send({ title: 'Team sync (moved)' })
      .expect(200);
    await request(http).delete(`/calendar/events/${hrEventId}`).set('Cookie', gro.cookie).expect(200);
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

  // Every staff role now holds gro.read (ADR-013 — the recruiter/finance seats
  // that lacked it became HR officers), so the per-source gate is exercised by
  // the Auditor's read-only view instead: all sources, through reads alone.
  it("the Auditor's view carries every source, including GRO", async () => {
    const res = await request(http).get(`/calendar/view${RANGE}`).set('Cookie', auditor.cookie).expect(200);
    const kinds = new Set(res.body.items.map((i: { kind: string }) => i.kind));
    expect(kinds.has('gro')).toBe(true);
    expect(kinds.has('request')).toBe(true);
  });

  // DS-14: the calendar's person filter needs to know whose each item is — an
  // event's owner, a deadline's assignee, null when unassigned.
  it('each view item names its owner: event owner, deadline assignee, or null', async () => {
    await request(http)
      .post('/calendar/events')
      .set('Cookie', gro.cookie)
      .send({
        clientId,
        title: 'CAL owner probe',
        startAt: '2026-08-11T09:00:00Z',
        endAt: '2026-08-11T10:00:00Z',
      })
      .expect(201);
    await owner.task.updateMany({
      where: { clientId, title: 'CAL active task' },
      data: { assigneeUserId: hr.userId },
    });
    await owner.task.create({
      data: {
        clientId,
        title: 'CAL unassigned task',
        status: 'open',
        dueDate: new Date('2026-08-14'),
      },
    });
    await owner.request.updateMany({
      where: { clientId, title: 'CAL request' },
      data: { assigneeUserId: gro.userId },
    });
    await owner.groProcess.updateMany({
      where: { clientId },
      data: { assigneeUserId: admin.userId },
    });

    const res = await request(http)
      .get(`/calendar/view${RANGE}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    type Item = {
      kind: string;
      title: string;
      clientId: string | null;
      ownerUserId: string | null;
    };
    const items = res.body.items as Item[];
    const byTitle = (t: string) => items.find((i) => i.title === t);
    expect(byTitle('CAL owner probe')?.ownerUserId).toBe(gro.userId);
    expect(byTitle('CAL active task')?.ownerUserId).toBe(hr.userId);
    expect(byTitle('CAL request')?.ownerUserId).toBe(gro.userId);
    expect(items.find((i) => i.kind === 'gro' && i.clientId === clientId)?.ownerUserId).toBe(
      admin.userId,
    );
    // unassigned work belongs to no one — null, not absent
    const unassigned = byTitle('CAL unassigned task');
    expect(unassigned).toBeDefined();
    expect(unassigned).toHaveProperty('ownerUserId', null);
  });

  it('the view requires from and to (400)', async () => {
    await request(http).get('/calendar/view').set('Cookie', admin.cookie).expect(400);
  });
});
