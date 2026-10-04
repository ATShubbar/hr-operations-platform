import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { monthsAccrued, riyadhToday } from '../src/modules/leave/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// LEAVE-03 (ADR-014): balances over HTTP, built through the real flow — raise →
// approve → file — so the figures come from the ledger filing writes. "Today" is
// the real Riyadh day; every date below is placed relative to its year.
const MARK = 'LEAVE-03-test';

describe('Leave balances (LEAVE-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const co = { x: '', y: '' };
  const emp = { veteran: '', carrier: '', me: '', outsider: '' };
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let managerX: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };

  const today = riyadhToday();
  const Y = today.getUTCFullYear();
  const http = () => request(app.getHttpServer());
  const balanceOf = async (who: TestPrincipal, employeeId: string) =>
    (await http().get(`/leave/balances/${employeeId}`).set('Cookie', who.cookie).expect(200)).body;

  // Raise (HR) → approve (client manager) → file (HR). Returns the request.
  async function fileLeave(employeeId: string, type: string, startDate: string, days: number) {
    const raised = await http()
      .post('/leave')
      .set('Cookie', hr.cookie)
      .send({ employeeId, type, startDate, days })
      .expect(201);
    await http().post(`/leave/${raised.body.id}/approve`).set('Cookie', managerX.cookie).expect(200);
    await http().post(`/leave/${raised.body.id}/file`).set('Cookie', hr.cookie).expect(200);
    return raised.body as { id: string; ref: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    const company = (n: string) => owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} ${n}` } });
    co.x = (await company('X')).id;
    co.y = (await company('Y')).id;
    await owner.clientSetting.create({ data: { clientId: co.x, key: 'flag.employee-self-service', value: true } });
    const person = async (clientId: string, name: string, hireDate: string | null) =>
      (
        await owner.employee.create({
          data: {
            clientId,
            nameAr: 'موظف',
            nameEn: `${MARK} ${name}`,
            nationality: 'EG',
            contractType: 'unlimited',
            hireDate: hireDate ? new Date(`${hireDate}T00:00:00Z`) : null,
          },
        })
      ).id;
    emp.veteran = await person(co.x, 'veteran', '2015-01-01'); // 30 days a year
    emp.carrier = await person(co.x, 'carrier', '2015-01-01');
    emp.me = await person(co.x, 'me', null); // no hire date → 21
    emp.outsider = await person(co.y, 'outsider', '2015-01-01');

    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    managerX = await loginAsClientRep(app, co.x);
    me = await loginAsEmployee(app, emp.me);
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.y] };
    await owner.leaveEntry.deleteMany({ where: { clientId: companies } });
    await owner.leaveRequest.deleteMany({ where: { clientId: companies } });
    await owner.notification.deleteMany({ where: { category: 'leave', recipientUserId: hr.userId } });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    await owner.$disconnect();
    await app.close();
  });

  it('starts from the entitlement: 30 days after five years, accrued month by month', async () => {
    const b = (await balanceOf(hr, emp.veteran)).balance;
    const months = monthsAccrued(new Date('2015-01-01T00:00:00Z'), today);
    expect(b).toMatchObject({
      year: Y,
      entitlement: 30,
      accrued: Math.round((30 / 12) * months),
      carried: 0,
      taken: 0,
      booked: 0,
      pending: 0,
    });
    expect(b.available).toBe(b.accrued);
  });

  it('filed leave moves the balance: ended → taken, still to come → booked; pending shown, not deducted', async () => {
    const before = (await balanceOf(hr, emp.veteran)).balance;
    await fileLeave(emp.veteran, 'annual', `${Y}-01-05`, 3); // ended → taken
    await fileLeave(emp.veteran, 'annual', `${Y}-12-20`, 2); // to come → booked
    await fileLeave(emp.veteran, 'sick', `${Y}-02-01`, 2); // recorded, not deducted
    await http()
      .post('/leave')
      .set('Cookie', hr.cookie)
      .send({ employeeId: emp.veteran, type: 'annual', startDate: `${Y}-11-01`, days: 4 })
      .expect(201); // pending

    const b = (await balanceOf(hr, emp.veteran)).balance;
    expect(b).toMatchObject({ taken: 3, booked: 2, pending: 4, sick: 2 });
    expect(b.available).toBe(before.available - 5);
  });

  it('leave crossing 31 December is split by day: only this year’s days count this year', async () => {
    const before = (await balanceOf(hr, emp.veteran)).balance;
    const spell = await fileLeave(emp.veteran, 'annual', `${Y}-12-29`, 5); // 3 in Y, 2 in Y+1
    const after = await balanceOf(hr, emp.veteran);
    expect(after.balance.booked).toBe(before.booked + 3);
    const parts = after.history.filter((h: { ref: string }) => h.ref === spell.ref);
    expect(parts).toEqual([
      { ref: spell.ref, type: 'annual', startDate: `${Y + 1}-01-01`, endDate: `${Y + 1}-01-02`, days: 2, leaveYear: Y + 1, state: 'booked' },
      { ref: spell.ref, type: 'annual', startDate: `${Y}-12-29`, endDate: `${Y}-12-31`, days: 3, leaveYear: Y, state: 'booked' },
    ]);
  });

  it('a client manager sees their own company’s balances only', async () => {
    const list = await http().get('/leave/balances').set('Cookie', managerX.cookie).expect(200);
    const ids = list.body.balances.map((b: { employee: { id: string } }) => b.employee.id);
    expect(ids).toEqual(expect.arrayContaining([emp.veteran, emp.carrier, emp.me]));
    expect(ids).not.toContain(emp.outsider);
    expect(list.body.balances.every((b: { employee: { clientId: string } }) => b.employee.clientId === co.x)).toBe(true);
    await http().get(`/leave/balances/${emp.outsider}`).set('Cookie', managerX.cookie).expect(404);
    await http().get(`/leave/balances/${emp.veteran}`).set('Cookie', managerX.cookie).expect(200);
  });

  it('an employee sees their own balance through /me, and is refused the staff routes', async () => {
    const mine = await http().get('/me/leave/balance').set('Cookie', me.cookie).expect(200);
    expect(mine.body.employee.id).toBe(emp.me);
    expect(mine.body.balance.entitlement).toBe(21); // no hire date
    await http().get('/leave/balances').set('Cookie', me.cookie).expect(403);
    await http().get(`/leave/balances/${emp.me}`).set('Cookie', me.cookie).expect(403);
  });

  describe('carry-over', () => {
    it('credits last year’s unused balance (at most 10), once — a re-run credits nobody twice', async () => {
      // The carrier took 25 of 30 days last year → 5 to carry.
      await owner.leaveEntry.create({
        data: {
          clientId: co.x,
          employeeId: emp.carrier,
          kind: 'taken',
          type: 'annual',
          startDate: new Date(`${Y - 1}-03-01T00:00:00Z`),
          endDate: new Date(`${Y - 1}-03-25T00:00:00Z`),
          days: 25,
          leaveYear: Y - 1,
          requestId: '00000000-0000-4000-8000-00000000c0de',
        },
      });
      await http().post('/leave/carry-over').set('Cookie', hr.cookie).send({ year: Y, clientId: co.x }).expect(403);

      const first = await http()
        .post('/leave/carry-over')
        .set('Cookie', admin.cookie)
        .send({ year: Y, clientId: co.x })
        .expect(200);
      // veteran (nothing recorded last year → full 30 → capped 10), carrier (5), me (21 → 10)
      expect(first.body).toEqual({ year: Y, credited: 3, alreadyCredited: 0, nothingToCarry: 0 });

      const carried = await owner.leaveEntry.findMany({
        where: { clientId: co.x, kind: 'carried', leaveYear: Y },
        select: { employeeId: true, days: true },
      });
      expect(new Map(carried.map((c) => [c.employeeId, c.days]))).toEqual(
        new Map([
          [emp.veteran, 10],
          [emp.carrier, 5],
          [emp.me, 10],
        ]),
      );
      expect((await balanceOf(hr, emp.carrier)).balance.carried).toBe(5);

      const again = await http()
        .post('/leave/carry-over')
        .set('Cookie', admin.cookie)
        .send({ year: Y, clientId: co.x })
        .expect(200);
      expect(again.body).toEqual({ year: Y, credited: 0, alreadyCredited: 3, nothingToCarry: 0 });
      expect(await owner.leaveEntry.count({ where: { clientId: co.x, kind: 'carried', leaveYear: Y } })).toBe(3);

      // Audited, one entry per credit.
      expect(
        await owner.auditEntry.count({
          where: { resource: 'leave-balance', action: 'carry-over', clientId: co.x },
        }),
      ).toBe(3);
    });

    it('the database refuses a second carry-over credit for the same person and year', async () => {
      await expect(
        owner.leaveEntry.create({
          data: { clientId: co.x, employeeId: emp.carrier, kind: 'carried', type: 'annual', days: 1, leaveYear: Y },
        }),
      ).rejects.toThrow();
    });
  });
});
