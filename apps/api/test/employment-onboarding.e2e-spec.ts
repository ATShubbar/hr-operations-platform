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

// MOB-04a (ADR-018): the employment status `onboarding` — hired, not yet arrived.
// Such a person is on file (lists, the record, the employer's list) but is NOT
// under management: no headcount, no Saudisation share, no leave. The status is
// the onboarding sequence's to set and clear — never a hand edit — and
// terminating someone cancels their running onboarding.
const MARK = 'MOB-04a-test';
const YEAR = new Date().getUTCFullYear();

describe('Employment status `onboarding` (MOB-04a, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let co = '';
  const ids = { active: '', arriving: '', leaving: '' };
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let manager: TestPrincipal;

  const http = () => request(app.getHttpServer());
  const workforceRow = async () => {
    const res = await http().get('/reports/workforce').set('Cookie', admin.cookie).expect(200);
    return (res.body.rows as Array<Record<string, string | number>>).find(
      (r) => r.client === `${MARK} X`,
    )!;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await cleanup();
    co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    const mk = async (
      name: string,
      employmentStatus: 'active' | 'onboarding',
      nationality = 'IN',
    ) =>
      (
        await owner.employee.create({
          data: {
            clientId: co,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality,
            contractType: 'unlimited',
            employmentStatus,
          },
        })
      ).id;
    ids.active = await mk('active', 'active', 'SA');
    ids.arriving = await mk('arriving', 'onboarding');
    ids.leaving = await mk('leaving', 'active');
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    manager = await loginAsClientRep(app, co);
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    const emps = (
      await owner.employee.findMany({ where: { clientId: { in: cos } }, select: { id: true } })
    ).map((e) => e.id);
    const runs = (
      await owner.groSequence.findMany({
        where: { employeeId: { in: emps } },
        select: { id: true },
      })
    ).map((r) => r.id);
    await owner.groSequenceStep.deleteMany({ where: { sequenceId: { in: runs } } });
    await owner.groSequence.deleteMany({ where: { id: { in: runs } } });
    await owner.leaveEntry.deleteMany({ where: { employeeId: { in: emps } } });
    await owner.leaveRequest.deleteMany({ where: { employeeId: { in: emps } } });
    await owner.employee.deleteMany({ where: { id: { in: emps } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanup();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('is NOT in the headcount or the Saudisation share — the Workforce report shows them in their own column', async () => {
    const row = await workforceRow();
    // Two in post (one Saudi) + one on the way in.
    expect(row).toMatchObject({
      headcount: 2,
      active: 2,
      onboarding: 1,
      saudi: 1,
      nonSaudi: 1,
      saudizationPct: 50,
    });
  });

  it("is still on file: the staff list, their record and the employer's list show them, with the status", async () => {
    const list = await http()
      .get('/employees')
      .query({ clientId: co })
      .set('Cookie', hr.cookie)
      .expect(200);
    const mine = (list.body.employees as Array<{ id: string; employmentStatus: string }>).find(
      (e) => e.id === ids.arriving,
    );
    expect(mine?.employmentStatus).toBe('onboarding');
    const one = await http().get(`/employees/${ids.arriving}`).set('Cookie', hr.cookie).expect(200);
    expect(one.body.employmentStatus).toBe('onboarding');
  });

  it('cannot have leave raised, and is in neither the balances nor the carry-over', async () => {
    const raise = (employeeId: string) =>
      http()
        .post('/leave')
        .set('Cookie', hr.cookie)
        .send({ employeeId, type: 'annual', startDate: `${YEAR}-12-01`, days: 2 });
    await raise(ids.arriving).expect(400);
    await raise(ids.active).expect(201);

    const balances = await http().get('/leave/balances').set('Cookie', manager.cookie).expect(200);
    const listed = (balances.body.balances as Array<{ employee: { id: string } }>).map(
      (b) => b.employee.id,
    );
    expect(listed).toEqual(expect.arrayContaining([ids.active, ids.leaving]));
    expect(listed).not.toContain(ids.arriving);
    // Their own record's Leave tab still answers (nothing accrues to act on: raising is refused).
    await http().get(`/leave/balances/${ids.arriving}`).set('Cookie', hr.cookie).expect(200);

    const carry = await http()
      .post('/leave/carry-over')
      .set('Cookie', admin.cookie)
      .send({ year: YEAR, clientId: co })
      .expect(200);
    const { credited, alreadyCredited, nothingToCarry } = carry.body as {
      credited: number;
      alreadyCredited: number;
      nothingToCarry: number;
    };
    expect(credited + alreadyCredited + nothingToCarry).toBe(2); // the two in post — not the arrival
    expect(await owner.leaveEntry.count({ where: { employeeId: ids.arriving } })).toBe(0);
  });

  it('is never set or cleared by hand: creating or editing to `onboarding` is 400, editing away from it is 409', async () => {
    await http()
      .post('/employees')
      .set('Cookie', hr.cookie)
      .send({
        clientId: co,
        name: { ar: 'جديد', en: `${MARK} by hand` },
        nationality: 'IN',
        contractType: 'unlimited',
        employmentStatus: 'onboarding',
      })
      .expect(400);
    await http()
      .patch(`/employees/${ids.active}`)
      .set('Cookie', hr.cookie)
      .send({ employmentStatus: 'onboarding' })
      .expect(400);
    await http()
      .patch(`/employees/${ids.arriving}`)
      .set('Cookie', hr.cookie)
      .send({ employmentStatus: 'active' })
      .expect(409);
    await http()
      .patch(`/employees/${ids.arriving}`)
      .set('Cookie', hr.cookie)
      .send({ employmentStatus: 'suspended' })
      .expect(409);
    // Everything else about them is still editable.
    await http()
      .patch(`/employees/${ids.arriving}`)
      .set('Cookie', hr.cookie)
      .send({ department: 'Site A' })
      .expect(200);
    const row = await owner.employee.findUniqueOrThrow({ where: { id: ids.arriving } });
    expect(row).toMatchObject({ employmentStatus: 'onboarding', department: 'Site A' });
    expect(await owner.employee.count({ where: { nameEn: `${MARK} by hand` } })).toBe(0);
  });

  it('terminating someone cancels their running ONBOARDING — but leaves a running final exit to be finished', async () => {
    const seq = (employeeId: string, kind: string) =>
      http()
        .post(`/employees/${employeeId}/sequences`)
        .set('Cookie', gro.cookie)
        .send({ kind })
        .expect(201);
    const onboarding = (await seq(ids.arriving, 'onboarding')).body.id as string;
    const exit = (await seq(ids.leaving, 'final_exit')).body.id as string;

    await http().delete(`/employees/${ids.arriving}`).set('Cookie', admin.cookie).expect(200);
    await http().delete(`/employees/${ids.leaving}`).set('Cookie', admin.cookie).expect(200);

    const [a, b] = await Promise.all([
      owner.groSequence.findUniqueOrThrow({ where: { id: onboarding } }),
      owner.groSequence.findUniqueOrThrow({ where: { id: exit } }),
    ]);
    expect(a.status).toBe('cancelled');
    expect(a.cancelledAt).not.toBeNull();
    expect(b.status).toBe('running'); // the departure paperwork is still to do
    expect(
      await owner.auditEntry.count({
        where: { resource: 'gro-sequence', resourceId: ids.arriving, action: 'cancel' },
      }),
    ).toBe(1);
    expect(
      (await owner.employee.findUniqueOrThrow({ where: { id: ids.arriving } })).employmentStatus,
    ).toBe('terminated');
  });
});
