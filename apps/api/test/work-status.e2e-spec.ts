import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsEnrolledStaff, loginAsStaff, type TestPrincipal } from './helpers/login';

// CAL-04: the calendar view and the reports use the ONE shared answer to "is
// this finished?" (@hr/contracts/work-status) — so they agree with the queue. A
// REJECTED procedure is open work (shown, counted active and overdue); a RESOLVED
// request is finished (not shown as due, never overdue).
const MARK = 'CAL-04-test';
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe('One definition of finished (CAL-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let co = '';
  let empId = '';
  let gro: TestPrincipal;
  let admin: TestPrincipal;

  const http = () => request(app.getHttpServer());
  const view = async () =>
    JSON.stringify(
      (await http().get('/calendar/view').query({ from: ymd(day(-5)), to: ymd(day(5)) }).set('Cookie', gro.cookie).expect(200)).body,
    );
  const report = async (id: string) =>
    (await http().get(`/reports/${id}`).set('Cookie', admin.cookie).expect(200)).body as {
      summary: { active: number; overdue: number; requestsOverdue: number };
    };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    empId = (
      await owner.employee.create({
        data: { clientId: co, nameAr: 'موظف', nameEn: `${MARK} emp`, nationality: 'EG', contractType: 'unlimited' },
      })
    ).id;
    gro = await loginAsStaff(app, 'gro_officer');
    admin = await loginAsEnrolledStaff(app, 'administrator');
  });

  afterAll(async () => {
    await owner.groProcess.deleteMany({ where: { clientId: co } });
    await owner.request.deleteMany({ where: { clientId: co } });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: co } });
    await owner.client.deleteMany({ where: { id: co } });
    await owner.$disconnect();
    await app.close();
  });

  it('a REJECTED procedure is open work: on the calendar, active and overdue in the GRO workload report', async () => {
    const before = await report('gro-workload');
    const p = await owner.groProcess.create({
      data: { clientId: co, employeeId: empId, type: 'work_permit_renewal', status: 'rejected', dueDate: day(-2) },
    });
    expect(await view()).toContain(p.id);
    const after = await report('gro-workload');
    expect(after.summary.active).toBe(before.summary.active + 1);
    expect(after.summary.overdue).toBe(before.summary.overdue + 1);
  });

  it('a RESOLVED request is finished: not on the calendar, never overdue in Service operations', async () => {
    const before = await report('service-operations');
    const r = await owner.request.create({
      data: { clientId: co, type: 'letter', title: `${MARK} resolved`, createdByUserId: admin.userId, status: 'resolved', dueDate: day(-2) },
    });
    expect(await view()).not.toContain(r.id);
    const after = await report('service-operations');
    expect(after.summary.requestsOverdue).toBe(before.summary.requestsOverdue);
    // …while an OPEN one past due is overdue (the test can tell the difference).
    const open = await owner.request.create({
      data: { clientId: co, type: 'letter', title: `${MARK} open`, createdByUserId: admin.userId, status: 'in_progress', dueDate: day(-2) },
    });
    expect(await view()).toContain(open.id);
    expect((await report('service-operations')).summary.requestsOverdue).toBe(before.summary.requestsOverdue + 1);
  });
});
