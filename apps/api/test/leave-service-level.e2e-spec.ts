import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addWorkingDays, dayIn } from '@hr/dates';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { leaveServiceLevel } from '../src/modules/leave/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// SOON-03: the service level of a leave request.
//
// Owner decision: "a setting, shown and measured". An Administrator sets the
// number of WORKING days (2 to start). The clock runs from the day the request
// was submitted until PEOPLE&GRO files it, counted in the company's working
// week. Nothing is stored: the due date and the state are worked out when the
// request is read, so they always follow the current setting.

const KEY = 'leave.service-level-days';
const SUN_THU = [0, 1, 2, 3, 4];
const MARK = `LEAVE-SL-${Date.now()}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('leaveServiceLevel — the rule (SOON-03)', () => {
  const base = { days: 2, week: SUN_THU, filedOn: null as string | null };

  it('is due the given number of working days after the day it was submitted', () => {
    // Submitted Sunday 11 Oct 2026: Monday is day 1, Tuesday day 2.
    expect(
      leaveServiceLevel({
        ...base,
        submittedOn: '2026-10-11',
        status: 'pending',
        today: '2026-10-11',
      }),
    ).toEqual({ days: 2, dueOn: '2026-10-13', state: 'running', workingDaysOver: 0 });
  });

  it('skips the weekend of the company it belongs to', () => {
    // Submitted Thursday 15 Oct: Friday and Saturday are not working days.
    expect(
      leaveServiceLevel({
        ...base,
        submittedOn: '2026-10-15',
        status: 'pending',
        today: '2026-10-15',
      }).dueOn,
    ).toBe('2026-10-19');
    // One working day from that Thursday: Sunday at a Sunday–Thursday company,
    // Friday at a Monday–Friday one.
    const oneDay = { ...base, days: 1, submittedOn: '2026-10-15', status: 'pending' as const };
    expect(leaveServiceLevel({ ...oneDay, today: '2026-10-15' }).dueOn).toBe('2026-10-18');
    expect(leaveServiceLevel({ ...oneDay, week: [1, 2, 3, 4, 5], today: '2026-10-15' }).dueOn).toBe(
      '2026-10-16',
    );
    expect(
      leaveServiceLevel({
        ...base,
        week: [1, 2, 3, 4, 5],
        days: 1,
        submittedOn: '2026-10-16',
        status: 'pending',
        today: '2026-10-16',
      }).dueOn,
    ).toBe('2026-10-19');
  });

  it('is still running ON its due date, and overdue the day after — approved or not', () => {
    const on = { ...base, submittedOn: '2026-10-11' };
    expect(leaveServiceLevel({ ...on, status: 'pending', today: '2026-10-13' }).state).toBe(
      'running',
    );
    expect(leaveServiceLevel({ ...on, status: 'pending', today: '2026-10-14' })).toMatchObject({
      state: 'overdue',
      workingDaysOver: 1,
    });
    // Approved by the employer is not filed: the clock is still running.
    expect(leaveServiceLevel({ ...on, status: 'approved', today: '2026-10-13' }).state).toBe(
      'running',
    );
    expect(leaveServiceLevel({ ...on, status: 'approved', today: '2026-10-20' })).toMatchObject({
      state: 'overdue',
      workingDaysOver: 5, // Wed, Thu, Sun, Mon, Tue
    });
  });

  it('a filed request is judged by the day it was filed, for good', () => {
    const on = {
      ...base,
      submittedOn: '2026-10-11',
      status: 'filed' as const,
      today: '2027-01-01',
    };
    expect(leaveServiceLevel({ ...on, filedOn: '2026-10-13' })).toMatchObject({
      state: 'met',
      workingDaysOver: 0,
    });
    expect(leaveServiceLevel({ ...on, filedOn: '2026-10-15' })).toMatchObject({
      state: 'late',
      workingDaysOver: 2,
    });
  });

  it('a declined or withdrawn request is closed: nothing was owed', () => {
    for (const status of ['declined', 'withdrawn'] as const) {
      expect(
        leaveServiceLevel({ ...base, submittedOn: '2026-10-11', status, today: '2026-12-01' }),
      ).toMatchObject({ state: 'closed', workingDaysOver: 0, dueOn: '2026-10-13' });
    }
  });
});

describe('Leave service level over the API (SOON-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let clientId: string;
  let employeeId: string;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let manager: TestPrincipal;
  let me: TestPrincipal;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const today = () => dayIn(new Date(), 'Asia/Riyadh');
  const raise = async () => {
    n += 1;
    const res = await http()
      .post('/leave')
      .set('Cookie', hr.cookie)
      .send({ employeeId, type: 'unpaid', startDate: `2027-0${n}-01`, days: 1 })
      .expect(201);
    return res.body as { id: string; serviceLevel: unknown };
  };
  const read = async (id: string, who: TestPrincipal = hr) =>
    (await http().get(`/leave/${id}`).set('Cookie', who.cookie).expect(200)).body;
  const act = (who: TestPrincipal, id: string, verb: string) =>
    http().post(`/leave/${id}/${verb}`).set('Cookie', who.cookie);
  const submittedDaysAgo = (id: string, days: number) =>
    owner.leaveRequest.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - days * 86_400_000) },
    });
  const setDays = (who: TestPrincipal, value: unknown) =>
    http().patch(`/config/system/${KEY}`).set('Cookie', who.cookie).send({ value });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await owner.systemSetting.deleteMany({ where: { key: KEY } });
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Co` } })).id;
    await owner.clientSetting.create({
      data: { clientId, key: 'flag.employee-self-service', value: true },
    });
    employeeId = (
      await owner.employee.create({
        data: {
          clientId,
          nameAr: 'موظف',
          nameEn: `${MARK} person`,
          nationality: 'EG',
          contractType: 'unlimited',
        },
      })
    ).id;
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    manager = await loginAsClientRep(app, clientId);
    me = await loginAsEmployee(app, employeeId);
  });

  afterAll(async () => {
    await owner.systemSetting.deleteMany({ where: { key: KEY } });
    await owner.leaveEntry.deleteMany({ where: { clientId } });
    await owner.leaveRequest.deleteMany({ where: { clientId } });
    await owner.notification.deleteMany({ where: { category: 'leave' } }).catch(() => undefined);
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId } });
    await owner.clientSetting.deleteMany({ where: { clientId } });
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a new request is running, due two working days from today, with exactly these fields', async () => {
    const raised = await raise();
    expect(raised.serviceLevel).toEqual({
      days: 2,
      dueOn: iso(addWorkingDays(today(), 2, SUN_THU)),
      state: 'running',
      workingDaysOver: 0,
    });
  });

  it('goes overdue while unfiled — approval by the employer does not stop the clock — and is late once filed', async () => {
    const { id } = await raise();
    await submittedDaysAgo(id, 10);
    const submitted = dayIn(new Date(Date.now() - 10 * 86_400_000), 'Asia/Riyadh');
    const due = iso(addWorkingDays(submitted, 2, SUN_THU));

    const pending = await read(id);
    expect(pending.serviceLevel).toMatchObject({ dueOn: due, state: 'overdue' });
    expect(pending.serviceLevel.workingDaysOver).toBeGreaterThan(0);

    await act(manager, id, 'approve').expect(200);
    expect((await read(id)).serviceLevel.state).toBe('overdue');

    const filed = (await act(hr, id, 'file').expect(200)).body;
    expect(filed.serviceLevel).toMatchObject({ dueOn: due, state: 'late' });
  });

  it('is met when filed inside the service level, and closed when declined', async () => {
    const a = await raise();
    await act(manager, a.id, 'approve').expect(200);
    expect((await act(hr, a.id, 'file').expect(200)).body.serviceLevel.state).toBe('met');

    const b = await raise();
    await submittedDaysAgo(b.id, 10);
    expect((await act(manager, b.id, 'decline').expect(200)).body.serviceLevel.state).toBe(
      'closed',
    );
  });

  it('the client manager and the employee see the same service level on their own paths', async () => {
    const { id } = await raise();
    const staff = (await read(id)).serviceLevel;
    expect(staff).toMatchObject({ days: 2, state: 'running' });
    const list = (await http().get('/leave').set('Cookie', manager.cookie).expect(200)).body.leave;
    expect(list.find((r: { id: string }) => r.id === id).serviceLevel).toEqual(staff);
    const mine = (await http().get('/me/leave').set('Cookie', me.cookie).expect(200)).body.leave;
    expect(mine.find((r: { id: string }) => r.id === id).serviceLevel).toEqual(staff);
  });

  it('follows the working week of the company it belongs to', async () => {
    // A FIXED Wednesday, so the two weeks cannot agree by accident: two working
    // days on is Sunday at a Sunday–Thursday company and Friday at a Monday–Friday one.
    const { id } = await raise();
    await owner.leaveRequest.update({
      where: { id },
      data: { createdAt: new Date('2026-09-30T09:00:00.000Z') },
    });
    expect((await read(id)).serviceLevel.dueOn).toBe('2026-10-04');
    await owner.clientSetting.upsert({
      where: { clientId_key: { clientId, key: 'working.week' } },
      create: { clientId, key: 'working.week', value: [1, 2, 3, 4, 5] },
      update: { value: [1, 2, 3, 4, 5] },
    });
    expect((await read(id)).serviceLevel.dueOn).toBe('2026-10-02');
    await owner.clientSetting.delete({
      where: { clientId_key: { clientId, key: 'working.week' } },
    });
  });

  it('only an Administrator changes the setting, within 1 to 30 whole days — and every request follows it at once', async () => {
    const { id } = await raise();
    await submittedDaysAgo(id, 10);
    expect((await read(id)).serviceLevel).toMatchObject({ days: 2, state: 'overdue' });

    await setDays(hr, 5).expect(403);
    for (const bad of [0, 31, 2.5, '3', null]) await setDays(admin, bad).expect(400);

    await setDays(admin, 30).expect(200);
    const submitted = dayIn(new Date(Date.now() - 10 * 86_400_000), 'Asia/Riyadh');
    expect((await read(id)).serviceLevel).toEqual({
      days: 30,
      dueOn: iso(addWorkingDays(submitted, 30, SUN_THU)),
      state: 'running',
      workingDaysOver: 0,
    });
  });
});
