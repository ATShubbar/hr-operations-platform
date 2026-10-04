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
import { PolicyService } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
} from './helpers/login';

// REP-02: the reports API, re-pinned to the v1.7 matrix (ROLE-03, ADR-013).
// Reports are an Administrator + Auditor surface: the prototype's navigation
// makes them admin-only, and the Auditor reads them as part of reading
// everything. HR and GRO officers no longer hold `report.read`.
//
// The SECOND gate — each report's declared requiredPermissions — is still the
// load-bearing check (it is what would keep a future, narrower reader out of
// `payroll-cost`), but no v1.7 role exercises it: both report readers read all
// underlying data. So the last describe below proves it with a deliberately
// NARROWED policy (an Auditor without salary.read), not by trusting the code.

describe('Reports API (REP-02, e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let clientId: string;

  const ids = (body: ReportCatalogResponse) => body.reports.map((r) => r.id).sort();

  const catalogAs = async (cookie: string) =>
    reportCatalogResponseSchema.parse(
      (await request(app.getHttpServer()).get('/reports').set('Cookie', cookie).expect(200)).body,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
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

  it('the Administrator and the Auditor see all six reports', async () => {
    for (const role of ['administrator', 'auditor'] as const) {
      const p = await loginAsEnrolledStaff(app, role);
      const body = await catalogAs(p.cookie);
      expect(ids(body)).toEqual([...REPORT_IDS].sort());
      // The descriptor explains WHY a report is gated, so the UI can say so.
      const payroll = body.reports.find((r) => r.id === 'payroll-cost');
      expect(payroll?.requiredPermissions).toContain('salary.read');
      expect(payroll?.category).toBe('financial');
    }
  });

  // ADR-013 narrowing: every staff role read reports in v1.6.
  it('HR and GRO officers have no reporting surface (403)', async () => {
    for (const role of ['hr_officer', 'gro_officer'] as const) {
      const p = await loginAsStaff(app, role);
      await request(app.getHttpServer()).get('/reports').set('Cookie', p.cookie).expect(403);
      await request(app.getHttpServer())
        .get('/reports/workforce')
        .set('Cookie', p.cookie)
        .expect(403);
    }
  });

  it('runs a report the caller is entitled to, in the shared table shape', async () => {
    const auditor = await loginAsEnrolledStaff(app, 'auditor');
    const res = await request(app.getHttpServer())
      .get('/reports/payroll-cost')
      .set('Cookie', auditor.cookie)
      .expect(200);

    const body = reportResultResponseSchema.parse(res.body);
    expect(body.id).toBe('payroll-cost');
    expect(body.columns.map((c) => c.key)).toContain('monthlyTotal');
    expect(body.summary.annualTotal).toBeDefined();
    expect(new Date(body.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('unknown report id → 404', async () => {
    const staff = await loginAsEnrolledStaff(app, 'administrator');
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

// The per-report data gate, proven against a NARROWER reader than any v1.7 role:
// the Auditor with salary.read withheld. If the controller ever stopped checking
// requiredPermissions, `payroll-cost` would appear and run here.
describe('Reports API — the per-report data gate (REP-02, narrowed policy)', () => {
  let app: INestApplication;

  class NarrowedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'auditor' && permission === 'salary.read') return false;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(NarrowedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('a reader without salary.read neither sees nor runs payroll-cost (403 names it)', async () => {
    const auditor = await loginAsEnrolledStaff(app, 'auditor');
    const res = await request(app.getHttpServer())
      .get('/reports')
      .set('Cookie', auditor.cookie)
      .expect(200);
    const listed = reportCatalogResponseSchema.parse(res.body).reports.map((r) => r.id);
    expect(listed).not.toContain('payroll-cost');
    expect(listed).toContain('workforce');

    const refused = await request(app.getHttpServer())
      .get('/reports/payroll-cost')
      .set('Cookie', auditor.cookie)
      .expect(403);
    // The 403 names what is missing rather than pretending the report is absent.
    expect(refused.body.message).toContain('salary.read');
    // …and what they ARE entitled to still works.
    await request(app.getHttpServer())
      .get('/reports/workforce')
      .set('Cookie', auditor.cookie)
      .expect(200);
  });
});
