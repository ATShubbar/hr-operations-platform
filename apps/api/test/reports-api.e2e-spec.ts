import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  reportCatalogResponseSchema,
  reportResultResponseSchema,
  type ReportCatalogResponse,
} from '@hr/contracts';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { REPORT_IDS } from '../src/modules/reporting/public-api';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff } from './helpers/login';

// REP-02: the reports API. The point of this spec is the SECOND gate — every
// staff role holds `report.read`, but which reports they may list and run is
// decided by each report's declared requiredPermissions. A Recruiter must not be
// able to reach a salary figure through /reports.

describe('Reports API (REP-02, e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let clientId: string;

  const ids = (body: ReportCatalogResponse) => body.reports.map((r) => r.id).sort();

  const catalogFor = async (role: 'recruiter' | 'finance' | 'gro_officer' | 'hr_officer') => {
    const principal = await loginAsStaff(app, role);
    const res = await request(app.getHttpServer())
      .get('/reports')
      .set('Cookie', principal.cookie)
      .expect(200);
    return { principal, body: reportCatalogResponseSchema.parse(res.body) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const client = await db.client.create({
      data: { nameAr: 'شركة تقارير ٢', nameEn: 'REP-02 Fixture Co' },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await db.client.deleteMany({ where: { id: clientId } });
    await db.$disconnect();
    await app.close();
  });

  it('the contract enum matches the API catalog (no drift)', () => {
    const contractIds = reportCatalogResponseSchema.shape.reports.element.shape.id.options;
    expect([...contractIds].sort()).toEqual([...REPORT_IDS].sort());
  });

  it('HR Officer holds every underlying permission and sees all six reports', async () => {
    const { body } = await catalogFor('hr_officer');
    expect(ids(body)).toEqual([...REPORT_IDS].sort());
    // The descriptor explains WHY a report is gated, so the UI can say so.
    const payroll = body.reports.find((r) => r.id === 'payroll-cost');
    expect(payroll?.requiredPermissions).toContain('salary.read');
    expect(payroll?.category).toBe('financial');
  });

  it("Recruiter's catalog is recruitment-shaped — no GRO, no payroll, no compliance", async () => {
    const { body } = await catalogFor('recruiter');
    expect(ids(body)).toEqual(['recruitment-pipeline', 'service-operations', 'workforce']);
  });

  it("Finance's catalog is financial-shaped — payroll but no recruitment or GRO", async () => {
    const { body } = await catalogFor('finance');
    expect(ids(body)).toEqual(['payroll-cost', 'service-operations', 'workforce']);
  });

  it("GRO Officer's catalog carries GRO + compliance but not payroll", async () => {
    const { body } = await catalogFor('gro_officer');
    expect(ids(body)).toEqual([
      'compliance-expiry',
      'gro-workload',
      'service-operations',
      'workforce',
    ]);
  });

  it('runs a report the caller is entitled to, in the shared table shape', async () => {
    const finance = await loginAsStaff(app, 'finance');
    const res = await request(app.getHttpServer())
      .get('/reports/payroll-cost')
      .set('Cookie', finance.cookie)
      .expect(200);

    const body = reportResultResponseSchema.parse(res.body);
    expect(body.id).toBe('payroll-cost');
    expect(body.columns.map((c) => c.key)).toContain('monthlyTotal');
    expect(body.summary.annualTotal).toBeDefined();
    expect(new Date(body.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('refuses a report whose underlying data the caller may not read (403)', async () => {
    const recruiter = await loginAsStaff(app, 'recruiter');
    const res = await request(app.getHttpServer())
      .get('/reports/payroll-cost')
      .set('Cookie', recruiter.cookie)
      .expect(403);
    // The 403 names what is missing rather than pretending the report is absent.
    expect(res.body.message).toContain('salary.read');

    await request(app.getHttpServer())
      .get('/reports/gro-workload')
      .set('Cookie', recruiter.cookie)
      .expect(403);
    // …and what they ARE entitled to still works.
    await request(app.getHttpServer())
      .get('/reports/recruitment-pipeline')
      .set('Cookie', recruiter.cookie)
      .expect(200);
  });

  it('unknown report id → 404', async () => {
    const staff = await loginAsStaff(app);
    await request(app.getHttpServer())
      .get('/reports/not-a-report')
      .set('Cookie', staff.cookie)
      .expect(404);
  });

  it('client representatives have no reporting surface (403) and unauth is 401', async () => {
    const rep = await loginAsClientRep(app, clientId);
    await request(app.getHttpServer()).get('/reports').set('Cookie', rep.cookie).expect(403);
    await request(app.getHttpServer())
      .get('/reports/workforce')
      .set('Cookie', rep.cookie)
      .expect(403);

    await request(app.getHttpServer()).get('/reports').expect(401);
    await request(app.getHttpServer()).get('/reports/workforce').expect(401);
  });
});
