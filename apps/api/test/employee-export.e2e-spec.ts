import { createHash } from 'node:crypto';
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
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// SOON-01: "Export register" — the People list as a CSV file.
//
// Owner decisions: Administrator, HR officer and GRO officer may export; a client
// manager may export THEIR OWN company; the Auditor may not. The rows are what is
// on screen (the web sends the ids it is showing — a FILTER, never an authority).
// Each file holds only what its reader may already see: pay columns need
// salary.read, identifier numbers need govdata.read, and a client manager's file
// has neither. Every export is written to the audit trail.

const FLAG = 'flag.client-self-service';
const MARK = `EXPORT-${Date.now()}`;
const IBAN = 'SA0380000000608010167519';
const BOM = '﻿';

/** A CSV document → its header and data rows (quotes are not used by these fixtures). */
function parse(body: string): { header: string[]; rows: string[][] } {
  expect(body.startsWith(BOM)).toBe(true);
  const lines = body.slice(1).split('\r\n').filter(Boolean);
  const [header, ...rows] = lines.map((l) => l.split(','));
  return { header: header!, rows };
}

describe('Export register (SOON-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let alice: string;
  let bob: string;
  let formula: string;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let repA: TestPrincipal;
  let employee: TestPrincipal;

  const setFlag = (clientId: string, on: boolean) =>
    owner.clientSetting.upsert({
      where: { clientId_key: { clientId, key: FLAG } },
      create: { clientId, key: FLAG, value: on },
      update: { value: on },
    });

  const person = (clientId: string, nameEn: string, iqama: string) =>
    owner.employee.create({
      data: {
        clientId,
        nameAr: 'موظف',
        nameEn,
        nationality: 'EG',
        jobTitleEn: 'Accountant',
        jobTitleAr: 'محاسب',
        department: 'Finance',
        contractType: 'fixed_term',
        employmentStatus: 'active',
        hireDate: new Date('2024-03-01'),
        contractEndDate: new Date('2027-06-30'),
        basicSalary: 12345,
        housingAllowance: 3210,
        bankIban: IBAN,
        iqamaNumber: iqama,
        passportNumber: `P${iqama.slice(-6)}`,
        iqamaExpiry: new Date('2027-01-01'),
        workPermitExpiry: new Date('2027-02-01'),
        medicalInsuranceExpiry: new Date('2027-03-01'),
      },
    });

  const exportAs = (p: TestPrincipal, body?: object) =>
    request(http)
      .post('/employees/export')
      .set('Cookie', p.cookie)
      .send(body ?? {});
  const portalExport = (p: TestPrincipal, body?: object) =>
    request(http)
      .post('/portal/employees/export')
      .set('Cookie', p.cookie)
      .send(body ?? {});
  const lastExportAudit = async (actorId: string) =>
    (
      await owner.auditEntry.findMany({
        where: { resource: 'employee', action: 'export', actorId },
        orderBy: { id: 'desc' },
        take: 1,
      })
    )[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    clientA = (
      await owner.client.create({
        data: { nameAr: 'شركة التصدير أ', nameEn: `${MARK} Client A`, status: 'active' },
      })
    ).id;
    clientB = (
      await owner.client.create({
        data: { nameAr: 'شركة التصدير ب', nameEn: `${MARK} Client B`, status: 'active' },
      })
    ).id;
    alice = (await person(clientA, `${MARK} Alice`, '2111111111')).id;
    bob = (await person(clientB, `${MARK} Bob`, '2222222222')).id;
    formula = (await person(clientA, '=HYPERLINK("x")', '2333333333')).id;
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    repA = await loginAsClientRep(app, clientA, 'client_manager');
    employee = await loginAsEmployee(app, alice);
  });

  afterAll(async () => {
    await owner.auditEntry
      .deleteMany({ where: { resource: 'employee', action: 'export' } })
      .catch(() => undefined);
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('needs a signed-in person who holds employee.export — the Auditor and an employee do not', async () => {
    await request(http).post('/employees/export').send({}).expect(401);
    await request(http).post('/portal/employees/export').send({}).expect(401);
    await exportAs(auditor).expect(403);
    await exportAs(employee).expect(403);
    await portalExport(employee).expect(403);
  });

  it('a staff export is a CSV file of everyone, named and counted in its headers', async () => {
    const res = await exportAs(hr).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="employee-register-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const { header, rows } = parse(res.text);
    expect(header.slice(0, 4)).toEqual([
      'Name (English)',
      'Name (Arabic)',
      'Company (English)',
      'Company (Arabic)',
    ]);
    expect(rows).toHaveLength(await owner.employee.count());
    expect(res.headers['x-export-rows']).toBe(String(rows.length));
    // Cross-client: both fixture companies are in a staff export.
    const names = rows.map((r) => r[0]);
    expect(names).toContain(`${MARK} Alice`);
    expect(names).toContain(`${MARK} Bob`);
    const aliceRow = rows.find((r) => r[0] === `${MARK} Alice`)!;
    expect(aliceRow[header.indexOf('Company (English)')]).toBe(`${MARK} Client A`);
    expect(aliceRow[header.indexOf('Position (English)')]).toBe('Accountant');
    expect(aliceRow[header.indexOf('Hire date')]).toBe('2024-03-01');
    expect(aliceRow[header.indexOf('Contract end')]).toBe('2027-06-30');
  });

  it('with ids it exports exactly those rows, in that order — an unknown id is ignored', async () => {
    const res = await exportAs(hr, {
      ids: [bob, '33333333-3333-4333-8333-0000000000e9', alice],
    }).expect(200);
    const { rows } = parse(res.text);
    expect(rows.map((r) => r[0])).toEqual([`${MARK} Bob`, `${MARK} Alice`]);
    // No ids at all is "everyone"; an EMPTY list is "nobody" — the screen showed none.
    expect(parse((await exportAs(hr, { ids: [] }).expect(200)).text).rows).toHaveLength(0);
  });

  it('each staff file holds only what that person already sees: pay and identifier columns', async () => {
    for (const p of [admin, hr, gro]) {
      const seen = (
        await request(http).get(`/employees/${alice}`).set('Cookie', p.cookie).expect(200)
      ).body;
      const res = await exportAs(p, { ids: [alice] }).expect(200);
      const { header, rows } = parse(res.text);
      const sawPay = seen.salary !== null;
      const sawNumbers = seen.govdata?.iqamaNumber != null;
      const sawDates = seen.govdata !== null;
      expect(header.includes('Basic salary')).toBe(sawPay);
      expect(res.text.includes('12345')).toBe(sawPay);
      expect(header.includes('Iqama number')).toBe(sawNumbers);
      expect(res.text.includes('2111111111')).toBe(sawNumbers);
      expect(header.includes('Iqama expiry')).toBe(sawDates);
      if (sawDates) expect(rows[0]![header.indexOf('Iqama expiry')]).toBe('2027-01-01');
      // A bank account number never leaves in this file, whoever exports.
      expect(res.text).not.toContain(IBAN);
    }
    // At least one of the three sees pay and one sees identifier numbers — or
    // this test would pass without ever seeing those columns.
    const adminFile = parse((await exportAs(admin, { ids: [alice] }).expect(200)).text);
    expect(adminFile.header).toContain('Basic salary');
    expect(adminFile.header).toContain('Iqama number');
  });

  it('a value that a spreadsheet would run as a formula is written as text', async () => {
    const res = await exportAs(hr, { ids: [formula] }).expect(200);
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(res.text).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it('writes the export to the audit trail: who, how many rows, which columns, and a fingerprint', async () => {
    const before = await owner.auditEntry.count({
      where: { resource: 'employee', action: 'export' },
    });
    const res = await exportAs(gro, { ids: [alice, bob] }).expect(200);
    expect(
      await owner.auditEntry.count({ where: { resource: 'employee', action: 'export' } }),
    ).toBe(before + 1);
    const entry = await lastExportAudit(gro.userId);
    const { header } = parse(res.text);
    expect(entry?.clientId).toBeNull();
    expect(entry?.after).toMatchObject({
      rows: 2,
      scope: 'all',
      selected: true,
      sha256: createHash('sha256').update(res.text, 'utf8').digest('hex'),
    });
    expect((entry?.after as { columns: string[] }).columns).toHaveLength(header.length);
    // The act, never the data.
    expect(JSON.stringify(entry?.after)).not.toContain(MARK);
  });

  it('refuses a body it does not understand', async () => {
    await exportAs(hr, { ids: ['not-an-id'] }).expect(400);
    await exportAs(hr, { ids: [alice], everything: true }).expect(400);
    await exportAs(hr, {
      ids: Array.from({ length: 2001 }, () => alice),
    }).expect(400);
  });

  it('a client manager cannot use the staff route, though they hold the permission', async () => {
    await exportAs(repA).expect(403);
    await exportAs(repA, { ids: [bob] }).expect(403);
  });

  it('a client manager exports their OWN company only, once the portal is on', async () => {
    await portalExport(repA).expect(403); // the portal is off
    await setFlag(clientA, true);
    const res = await portalExport(repA).expect(200);
    const { header, rows } = parse(res.text);
    expect(rows).toHaveLength(2); // Alice and the formula fixture — never Bob
    expect(res.text).toContain(`${MARK} Alice`);
    expect(res.text).not.toContain(`${MARK} Bob`);
    // Dates, not numbers; no pay.
    expect(header).toContain('Iqama expiry');
    expect(header).not.toContain('Iqama number');
    expect(header).not.toContain('Basic salary');
    for (const secret of ['2111111111', '12345', '3210', IBAN, 'P111111']) {
      expect(res.text).not.toContain(secret);
    }
    // Another company's id is a filter that matches nothing of theirs.
    const forged = await portalExport(repA, { ids: [bob] }).expect(200);
    expect(parse(forged.text).rows).toHaveLength(0);
    expect(forged.text).not.toContain(`${MARK} Bob`);
    // Recorded against their company.
    const entry = await lastExportAudit(repA.userId);
    expect(entry?.clientId).toBe(clientA);
    expect(entry?.after).toMatchObject({ rows: 0, scope: clientA, selected: true });
  });

  it('staff cannot use the client route', async () => {
    await portalExport(hr).expect(403);
    await portalExport(admin).expect(403);
  });
});
