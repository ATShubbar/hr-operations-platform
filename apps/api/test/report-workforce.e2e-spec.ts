import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isUnderManagement } from '@hr/contracts';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsEnrolledStaff, type TestPrincipal } from './helpers/login';

// REP-06: the Workforce report counts people the way the dashboards do — UNDER
// MANAGEMENT (not left, at an ACTIVE company). Archived companies are left out of
// the report (owner decision); a leaver stays visible in Terminated but not in
// the headcount. The report's totals must equal the dashboards' rule applied to
// the same data.
const MARK = 'REP-06-test';

describe('Workforce report headcount (REP-06, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  const co = { live: '', archived: '' };

  const http = () => request(app.getHttpServer());
  type Row = Record<string, unknown>;
  const workforce = async () =>
    (await http().get('/reports/workforce').set('Cookie', admin.cookie).expect(200)).body as {
      rows: Row[];
      summary: { clients: number; headcount: number; saudi: number; saudizationPct: number };
    };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    admin = await loginAsEnrolledStaff(app, 'administrator');
    co.live = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Live` } })).id;
    co.archived = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Archived`, status: 'inactive' } })).id;
    const person = (clientId: string, nationality: string, employmentStatus: 'active' | 'on_leave' | 'terminated') =>
      owner.employee.create({
        data: { clientId, nameAr: 'موظف', nameEn: `${MARK} ${employmentStatus}`, nationality, contractType: 'unlimited', employmentStatus },
      });
    await person(co.live, 'SA', 'active');
    await person(co.live, 'IN', 'on_leave');
    await person(co.live, 'SA', 'terminated');
    await person(co.archived, 'SA', 'active');
    await person(co.archived, 'EG', 'active');
  });

  afterAll(async () => {
    await owner.employee.deleteMany({ where: { clientId: { in: [co.live, co.archived] } } });
    await owner.client.deleteMany({ where: { id: { in: [co.live, co.archived] } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('a company row counts the people under management; the leaver shows only as Terminated', async () => {
    const r = (await workforce()).rows.find((x) => x.client === `${MARK} Live`)!;
    expect(r).toMatchObject({ headcount: 2, active: 1, onLeave: 1, terminated: 1, saudi: 1, nonSaudi: 1, saudizationPct: 50 });
  });

  it('an archived company is left out of the report', async () => {
    const rows = (await workforce()).rows;
    expect(rows.some((x) => x.client === `${MARK} Archived`)).toBe(false);
  });

  it('the totals equal the dashboards’ rule over the same data', async () => {
    const report = await workforce();
    const clients = await owner.client.findMany({ select: { id: true, status: true } });
    const status = new Map(clients.map((c) => [c.id, c.status]));
    const people = (await owner.employee.findMany({ select: { clientId: true, employmentStatus: true, nationality: true } }))
      .filter((e) => isUnderManagement(e.employmentStatus, status.get(e.clientId) ?? 'inactive'));
    expect(report.summary.headcount).toBe(people.length);
    expect(report.summary.saudi).toBe(people.filter((e) => e.nationality === 'SA').length);
    expect(report.summary.clients).toBe(clients.filter((c) => c.status === 'active').length);
  });
});
