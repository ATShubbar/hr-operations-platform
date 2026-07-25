import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PERMISSIONS } from '../src/modules/auth/public-api';
import {
  REPORT_CATALOG,
  REPORT_DEFINITIONS,
  REPORT_IDS,
  ReportingService,
  isReportId,
  type ReportResult,
  type ReportRow,
} from '../src/modules/reporting/public-api';

// REP-01: the reporting read models. No HTTP surface yet (REP-02) — this
// exercises ReportingService directly.
//
// Method: a dedicated fixture client with known employees/vacancy/candidates/
// processes/requests/tasks/documents. Per-client reports are asserted ABSOLUTELY
// on the fixture client's row; globally-shaped reports (compliance kinds, GRO
// types) are asserted as DELTAS against a baseline run taken before the fixtures
// exist — so the suite is correct regardless of what else is in the dev database.

// Anchored FAR in the future on purpose: the document-expiry engine (EXP-01/02)
// scans a 60-day horizon in real time, and a concurrently-running scan spec would
// otherwise claim this spec's fixture document. Nothing here is within that window.
const NOW = new Date('2027-06-01T00:00:00Z');
const CLIENT_NAME = 'REP-01 Fixture Co';
const ACTOR = '00000000-0000-4000-8000-0000000000aa';

describe('Reporting — ReportingService (REP-01)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let reporting: ReportingService;
  let clientId: string;
  let employeeIds: string[] = [];
  const taskIds: string[] = [];
  const baseline = new Map<string, ReportResult>();

  const row = (result: ReportResult, key: string, value: string): ReportRow => {
    const found = result.rows.find((r) => r[key] === value);
    if (!found) throw new Error(`no ${result.id} row where ${key}=${value}`);
    return found;
  };
  const num = (r: ReportRow, key: string): number => r[key] as number;
  const total = (result: ReportResult, key: string): number => result.summary[key] ?? 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    reporting = app.get(ReportingService);
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });

    // Baseline BEFORE the fixtures exist.
    for (const id of REPORT_IDS) baseline.set(id, await reporting.run(id, NOW));

    const client = await db.client.create({
      data: { nameAr: 'شركة تقارير', nameEn: CLIENT_NAME },
    });
    clientId = client.id;

    const employees = await Promise.all([
      // active · Saudi · costed · iqama expired · passport due in 14d
      db.employee.create({
        data: {
          clientId,
          nameAr: 'موظف أ',
          nameEn: 'Employee A',
          nationality: 'SA',
          contractType: 'unlimited',
          basicSalary: '10000.00',
          housingAllowance: '2500.00',
          iqamaExpiry: new Date('2027-05-01'),
          passportExpiry: new Date('2027-06-15'),
        },
      }),
      // active · non-Saudi · costed · work permit due in 50d
      db.employee.create({
        data: {
          clientId,
          nameAr: 'موظف ب',
          nameEn: 'Employee B',
          nationality: 'PK',
          contractType: 'fixed_term',
          basicSalary: '8000.00',
          housingAllowance: '2000.00',
          workPermitExpiry: new Date('2027-07-20'),
        },
      }),
      // terminated · NOT costed (payroll counts active employees only)
      db.employee.create({
        data: {
          clientId,
          nameAr: 'موظف ج',
          nameEn: 'Employee C',
          nationality: 'EG',
          contractType: 'unlimited',
          employmentStatus: 'terminated',
          basicSalary: '20000.00',
          exitReentryExpiry: new Date('2027-08-25'),
        },
      }),
    ]);
    employeeIds = employees.map((e) => e.id);

    const vacancy = await db.vacancy.create({
      data: {
        clientId,
        titleAr: 'محاسب',
        titleEn: 'REP-01 Accountant',
        status: 'open',
        headcount: 2,
      },
    });
    await db.candidate.createMany({
      data: (['applied', 'interview', 'hired'] as const).map((stage, i) => ({
        clientId,
        vacancyId: vacancy.id,
        nameAr: `مرشح ${i}`,
        nameEn: `Candidate ${i}`,
        stage,
      })),
    });

    await db.groProcess.createMany({
      data: [
        // active + past due → overdue
        {
          clientId,
          employeeId: employeeIds[0]!,
          type: 'iqama_renewal',
          status: 'in_progress',
          dueDate: new Date('2027-05-10'),
        },
        // terminal + past due → NOT overdue
        {
          clientId,
          employeeId: employeeIds[1]!,
          type: 'iqama_renewal',
          status: 'completed',
          dueDate: new Date('2027-05-05'),
        },
      ],
    });

    await db.request.createMany({
      data: [
        {
          clientId,
          type: 'letter',
          title: 'REP-01 open request',
          status: 'open',
          dueDate: new Date('2027-05-15'),
          createdByUserId: ACTOR,
        },
        {
          clientId,
          type: 'general',
          title: 'REP-01 closed request',
          status: 'closed',
          dueDate: new Date('2027-05-15'),
          createdByUserId: ACTOR,
        },
      ],
    });

    const tasks = await Promise.all([
      db.task.create({
        data: { clientId, title: 'REP-01 open task', status: 'open', dueDate: new Date('2027-05-20') },
      }),
      db.task.create({
        data: { clientId, title: 'REP-01 done task', status: 'done', assigneeUserId: ACTOR },
      }),
      // no clientId — proves standalone internal tasks land in the "(no client)" row
      db.task.create({ data: { title: 'REP-01 standalone task', status: 'open' } }),
    ]);
    taskIds.push(...tasks.map((t) => t.id));

    await db.document.create({
      data: {
        clientId,
        category: 'contract',
        title: 'REP-01 contract',
        fileName: 'c.pdf',
        contentType: 'application/pdf',
        storageKey: `rep01/${clientId}/c.pdf`,
        status: 'available',
        expiryDate: new Date('2027-06-10'),
      },
    });
  });

  afterAll(async () => {
    await db.document.deleteMany({ where: { clientId } });
    await db.task.deleteMany({ where: { id: { in: taskIds } } });
    await db.request.deleteMany({ where: { clientId } });
    await db.groProcess.deleteMany({ where: { clientId } });
    await db.candidate.deleteMany({ where: { clientId } });
    await db.vacancy.deleteMany({ where: { clientId } });
    await db.employee.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.$disconnect();
    await app.close();
  });

  // ---- catalog ----

  it('declares every report with at least one catalogued permission', () => {
    expect(REPORT_DEFINITIONS).toHaveLength(REPORT_IDS.length);
    for (const def of REPORT_DEFINITIONS) {
      expect(def.requiredPermissions.length).toBeGreaterThan(0);
      for (const perm of def.requiredPermissions) {
        expect(PERMISSIONS).toContain(perm); // no report may invent a permission
      }
    }
    // The financial report is the narrowest gate in the matrix.
    expect(REPORT_CATALOG['payroll-cost'].requiredPermissions).toContain('salary.read');
    expect(REPORT_CATALOG['gro-workload'].requiredPermissions).toContain('gro.read');
    expect(isReportId('workforce')).toBe(true);
    expect(isReportId('nope')).toBe(false);
  });

  it('runs every catalogued report and returns a well-formed table', async () => {
    for (const id of REPORT_IDS) {
      const result = await reporting.run(id, NOW);
      expect(result.id).toBe(id);
      expect(result.generatedAt).toBe(NOW.toISOString());
      expect(result.columns.length).toBeGreaterThan(1);
      expect(Object.keys(result.summary).length).toBeGreaterThan(0);
      // Every row must fill every declared column — the export (REP-03) and the
      // table (REP-04) both fold over columns × rows.
      for (const r of result.rows) {
        for (const col of result.columns) expect(r).toHaveProperty(col.key);
      }
    }
  });

  // ---- read models ----

  it('workforce: headcount, status split and Saudization for the client', async () => {
    const r = row(await reporting.run('workforce', NOW), 'client', CLIENT_NAME);
    expect(num(r, 'headcount')).toBe(3);
    expect(num(r, 'active')).toBe(2);
    expect(num(r, 'terminated')).toBe(1);
    expect(num(r, 'saudi')).toBe(1);
    expect(num(r, 'nonSaudi')).toBe(2);
    expect(num(r, 'saudizationPct')).toBe(33.33);
  });

  it('compliance-expiry: buckets each government item and document by horizon', async () => {
    const before = baseline.get('compliance-expiry')!;
    const after = await reporting.run('compliance-expiry', NOW);
    const delta = (item: string, bucket: string) =>
      num(row(after, 'item', item), bucket) - num(row(before, 'item', item), bucket);

    expect(delta('Iqama', 'expired')).toBe(1); // 2026-07-01, past
    expect(delta('Passport', 'due30')).toBe(1); // +14d
    expect(delta('Work permit', 'due60')).toBe(1); // +50d
    expect(delta('Exit/re-entry', 'due90')).toBe(1); // +85d
    expect(delta('Documents', 'due30')).toBe(1); // +9d
    expect(total(after, 'total') - total(before, 'total')).toBe(5);
  });

  it('recruitment-pipeline: candidate stage counts per vacancy', async () => {
    const result = await reporting.run('recruitment-pipeline', NOW);
    const r = row(result, 'vacancy', 'REP-01 Accountant');
    expect(r.client).toBe(CLIENT_NAME);
    expect(r.status).toBe('open');
    expect(num(r, 'headcount')).toBe(2);
    expect(num(r, 'applied')).toBe(1);
    expect(num(r, 'interview')).toBe(1);
    expect(num(r, 'hired')).toBe(1);
    expect(num(r, 'candidates')).toBe(3);
  });

  it('gro-workload: counts by type, and only ACTIVE past-due processes are overdue', async () => {
    const before = baseline.get('gro-workload')!;
    const after = await reporting.run('gro-workload', NOW);
    const prior = before.rows.find((r) => r.type === 'iqama_renewal');
    const now = row(after, 'type', 'iqama_renewal');
    const delta = (key: string) => num(now, key) - (prior ? num(prior, key) : 0);

    expect(delta('inProgress')).toBe(1);
    expect(delta('completed')).toBe(1);
    expect(delta('total')).toBe(2);
    // Both are past due; the completed one is terminal, so only one is overdue.
    expect(delta('overdue')).toBe(1);
    expect(total(after, 'overdue') - total(before, 'overdue')).toBe(1);
  });

  it('service-operations: requests beside tasks, with overdue and unassigned', async () => {
    const result = await reporting.run('service-operations', NOW);
    const r = row(result, 'client', CLIENT_NAME);
    expect(num(r, 'reqOpen')).toBe(1);
    expect(num(r, 'reqDone')).toBe(1);
    expect(num(r, 'reqOverdue')).toBe(1); // the closed one is terminal
    expect(num(r, 'taskOpen')).toBe(1);
    expect(num(r, 'taskDone')).toBe(1);
    expect(num(r, 'taskOverdue')).toBe(1);
    expect(num(r, 'taskUnassigned')).toBe(1);
    // A task with no client is still reported, under its own row.
    expect(num(row(result, 'client', '(no client)'), 'taskOpen')).toBeGreaterThanOrEqual(1);
  });

  it('payroll-cost: costs ACTIVE employees only, with allowances', async () => {
    const result = await reporting.run('payroll-cost', NOW);
    const r = row(result, 'client', CLIENT_NAME);
    expect(num(r, 'employees')).toBe(2); // the terminated employee is not a cost
    expect(num(r, 'basicTotal')).toBe(18000);
    expect(num(r, 'allowancesTotal')).toBe(4500);
    expect(num(r, 'monthlyTotal')).toBe(22500);
    expect(num(r, 'avgMonthly')).toBe(11250);
    expect(r.currency).toBe('SAR');
    const before = baseline.get('payroll-cost')!;
    expect(total(result, 'monthlyTotal') - total(before, 'monthlyTotal')).toBe(22500);
    expect(total(result, 'annualTotal')).toBe(Math.round(total(result, 'monthlyTotal') * 12 * 100) / 100);
  });
});
