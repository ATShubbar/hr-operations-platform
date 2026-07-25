import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsStaff } from './helpers/login';

// REP-03: the CSV export — the FIRST audited READ in the system. What matters
// here is (a) the export capability is distinct from reading, (b) the data gate
// still applies, (c) every extraction leaves an audit row, and (d) that row
// records the ACT, never the exported values.

const TRICKY_CLIENT = 'Al-Rajhi, "Trading" Co';

describe('Reports export (REP-03, e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let clientId: string;

  const auditRows = () =>
    db.auditEntry.findMany({ where: { resource: 'report', action: 'export' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    // A client name carrying a comma AND quotes — the CSV escaping case that
    // silently corrupts a spreadsheet if it is wrong.
    const client = await db.client.create({
      data: { nameAr: 'الراجحي', nameEn: TRICKY_CLIENT },
    });
    clientId = client.id;
    await db.auditEntry.deleteMany({ where: { resource: 'report' } });
  });

  afterAll(async () => {
    await db.auditEntry.deleteMany({ where: { resource: 'report' } });
    await cleanupHelperUsers(app);
    await db.client.deleteMany({ where: { id: clientId } });
    await db.$disconnect();
    await app.close();
  });

  it('exports CSV with download headers, a BOM, and RFC-4180 quoting', async () => {
    const finance = await loginAsStaff(app, 'finance');
    const res = await request(app.getHttpServer())
      .get('/reports/workforce/export')
      .set('Cookie', finance.cookie)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="workforce-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    const body = res.text;
    expect(body.startsWith('﻿')).toBe(true); // Excel reads Arabic correctly
    const lines = body.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Client,Headcount,Active,On leave,Suspended,Terminated,Saudi,Non-Saudi,Saudization %',
    );
    // The comma-and-quote client name is quoted, with its quotes doubled.
    const tricky = lines.find((l) => l.includes('Al-Rajhi'));
    expect(tricky).toContain('"Al-Rajhi, ""Trading"" Co"');
    // The summary travels with the table, after a blank line.
    expect(lines).toContain('Summary,Value');
  });

  it('the CSV matches the JSON run row-for-row', async () => {
    const staff = await loginAsStaff(app, 'hr_officer');
    const json = await request(app.getHttpServer())
      .get('/reports/service-operations')
      .set('Cookie', staff.cookie)
      .expect(200);
    const csv = await request(app.getHttpServer())
      .get('/reports/service-operations/export')
      .set('Cookie', staff.cookie)
      .expect(200);

    const lines = csv.text.slice(1).split('\r\n');
    const blank = lines.indexOf('');
    const dataRows = lines.slice(1, blank); // header excluded, summary excluded
    expect(dataRows).toHaveLength(json.body.rows.length);
    expect(lines[0]?.split(',').length).toBe(json.body.columns.length);
  });

  it('every export writes ONE audit row recording the ACT, not the data', async () => {
    const before = await auditRows();
    const finance = await loginAsStaff(app, 'finance');
    await request(app.getHttpServer())
      .get('/reports/payroll-cost/export')
      .set('Cookie', finance.cookie)
      .expect(200);

    const after = await auditRows();
    expect(after.length).toBe(before.length + 1);
    // Identify the row by its actor rather than by position — findMany has no
    // inherent ordering.
    const mine = after.filter((e) => e.actorId === finance.userId);
    expect(mine).toHaveLength(1);
    const entry = mine[0]!;
    expect(entry.actorRole).toBe('finance');
    const recorded = entry.after as Record<string, unknown>;
    expect(recorded.reportId).toBe('payroll-cost');
    expect(recorded.format).toBe('csv');
    expect(recorded.rows).toEqual(expect.any(Number));
    // The audit must NOT copy the exported payload into aud_entries — it records
    // who extracted what shape, not the salary figures themselves.
    expect(Object.keys(recorded).sort()).toEqual([
      'columns',
      'format',
      'generatedAt',
      'reportId',
      'rows',
    ]);
  });

  it('Read Only may read a report but NOT export it (403)', async () => {
    const readOnly = await loginAsStaff(app, 'read_only');
    await request(app.getHttpServer())
      .get('/reports/workforce')
      .set('Cookie', readOnly.cookie)
      .expect(200);
    const before = await auditRows();
    await request(app.getHttpServer())
      .get('/reports/workforce/export')
      .set('Cookie', readOnly.cookie)
      .expect(403);
    // A refused export leaves no audit row — nothing was extracted.
    expect(await auditRows()).toHaveLength(before.length);
  });

  it('the data gate still applies to exports, and format is validated', async () => {
    const recruiter = await loginAsStaff(app, 'recruiter');
    // holds report.export, but not salary.read
    await request(app.getHttpServer())
      .get('/reports/payroll-cost/export')
      .set('Cookie', recruiter.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/reports/not-a-report/export')
      .set('Cookie', recruiter.cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get('/reports/workforce/export?format=pdf')
      .set('Cookie', recruiter.cookie)
      .expect(400);
    // csv is accepted explicitly as well as by default
    await request(app.getHttpServer())
      .get('/reports/workforce/export?format=csv')
      .set('Cookie', recruiter.cookie)
      .expect(200);
  });

  it('unauthenticated export is 401', async () => {
    await request(app.getHttpServer()).get('/reports/workforce/export').expect(401);
  });
});
