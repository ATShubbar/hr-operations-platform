import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { severityOf } from '../src/modules/audit/public-api';
import { AUDITED_READS, AUDITED_WRITES } from './audit/audited-writes';
import { cleanupHelperUsers, loginAsEnrolledStaff, loginAsStaff, type TestPrincipal } from './helpers/login';

// AUDIT-07: the audit trail's SEVERITY (Routine / Notable / Critical — derived
// from what happened, one rule table) and its EXPORT — the events matching the
// current filters as CSV (REP-03's format), WITH before/after values (owner),
// for the Administrator and the Auditor, itself audited as Critical with the
// file's SHA-256 so a copy can be checked against the log.

describe('Audit severity + export (AUDIT-07, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let auditor: TestPrincipal;
  let hr: TestPrincipal;
  // A made-up actor, so this spec's rows can be filtered exactly.
  const actor = randomUUID();

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    admin = await loginAsEnrolledStaff(app, 'administrator');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    hr = await loginAsStaff(app, 'hr_officer');
    await owner.auditEntry.createMany({
      data: [
        { actorId: actor, actorRole: 'administrator', resource: 'staff-user', action: 'update', after: { role: 'auditor' } },
        { actorId: actor, actorRole: 'hr_officer', resource: 'salary', action: 'update', before: { basicSalary: 9000 }, after: { basicSalary: 12500 } },
        { actorId: actor, actorRole: 'hr_officer', resource: 'task', action: 'create', after: { title: 'Prepare, "quoted" file' } },
      ],
    });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { actorId: { in: [actor, admin.userId, auditor.userId] } } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  describe('severity', () => {
    it('the rule table: accounts/roles, settings, legal hold, terminating, quarantine, audit export are Critical', () => {
      for (const [r, a] of [
        ['staff-user', 'create'], ['staff-user', 'update'], ['client-user', 'delete'], ['employee-user', 'invite'],
        ['config', 'system-set'], ['config', 'client-set'], ['config', 'client-clear'], ['document', 'legal-hold'],
        ['employee', 'delete'], ['document', 'quarantine'], ['audit', 'export'],
      ]) expect(severityOf(r!, a!), `${r}.${a}`).toBe('critical');
    });

    it('…pay and ID changes, decisions, sensitive deletes, exports and ID lookups are Notable; the rest Routine', () => {
      for (const [r, a] of [
        ['salary', 'update'], ['govdata', 'update'], ['request', 'process'], ['leave', 'approve'], ['leave', 'decline'],
        ['leave', 'file'], ['client', 'delete'], ['client', 'archive'], ['document', 'delete'], ['candidate', 'delete'],
        ['report', 'export'], ['search', 'identifier-lookup'], ['leave-balance', 'carry-over'],
        ['dependant', 'create'], ['dependant', 'update'], ['dependant', 'remove'],
      ]) expect(severityOf(r!, a!), `${r}.${a}`).toBe('notable');
      for (const [r, a] of [['task', 'create'], ['request-comment', 'create'], ['calendar-event', 'update'], ['config', 'user-set']])
        expect(severityOf(r!, a!), `${r}.${a}`).toBe('routine');
    });

    it('every audited write and read has a severity (none is unknown)', () => {
      for (const pair of [...Object.values(AUDITED_WRITES), ...Object.values(AUDITED_READS)]) {
        const [r, a] = pair.split('.');
        expect(['routine', 'notable', 'critical']).toContain(severityOf(r!, a!));
      }
    });

    it('entries carry their severity, and the list filters by it on the server', async () => {
      const all = (await http().get('/audit').query({ actorId: actor }).set('Cookie', admin.cookie).expect(200)).body.entries;
      expect(all.map((e: { severity: string }) => e.severity).sort()).toEqual(['critical', 'notable', 'routine']);
      const critical = (await http().get('/audit').query({ actorId: actor, severity: 'critical' }).set('Cookie', admin.cookie).expect(200)).body.entries;
      expect(critical.map((e: { resource: string }) => e.resource)).toEqual(['staff-user']);
      const routine = (await http().get('/audit').query({ actorId: actor, severity: 'routine' }).set('Cookie', admin.cookie).expect(200)).body.entries;
      expect(routine.map((e: { resource: string }) => e.resource)).toEqual(['task']);
    });

    it('the summary counts critical events in the window (the Flagged-critical tile)', async () => {
      const from = new Date(Date.now() - 60_000).toISOString();
      const s = (await http().get('/audit/summary').query({ from }).set('Cookie', admin.cookie).expect(200)).body;
      expect(s.critical).toBeGreaterThanOrEqual(1);
      const before = s.critical as number;
      await owner.auditEntry.create({ data: { actorId: actor, resource: 'config', action: 'system-set', after: {} } });
      const after = (await http().get('/audit/summary').query({ from }).set('Cookie', admin.cookie).expect(200)).body;
      expect(after.critical).toBe(before + 1);
      await owner.auditEntry.deleteMany({ where: { actorId: actor, resource: 'config' } });
    });
  });

  describe('export', () => {
    it('the filtered events as CSV with full before/after values; Excel-safe; itself audited as Critical with its SHA-256', async () => {
      const res = await http().get('/audit/export').query({ actorId: actor }).set('Cookie', admin.cookie).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="audit-trail-\d{4}-\d{2}-\d{2}\.csv"/);
      const body = res.text;
      expect(body.charCodeAt(0)).toBe(0xfeff); // BOM — Excel opens Arabic correctly
      const lines = body.slice(1).trim().split('\r\n');
      expect(lines[0]).toBe('When (UTC),Severity,Actor,Role,Record type,Record id,Action,Client,Before,After,Request id');
      expect(lines).toHaveLength(4); // header + this actor's three events
      expect(body).toContain('"{""basicSalary"":9000}"'); // values included, JSON, quoted per RFC 4180
      expect(body).toContain('12500');
      expect(body).toContain('Prepare, \\""quoted\\"" file'); // commas and quotes survive

      const logged = await owner.auditEntry.findFirst({
        where: { resource: 'audit', action: 'export', actorId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect(logged?.after).toMatchObject({
        rows: 3,
        truncated: false,
        sha256: createHash('sha256').update(body, 'utf8').digest('hex'),
        filters: { actorId: actor },
      });
      expect(severityOf('audit', 'export')).toBe('critical');
    });

    it('honours the severity filter like the list', async () => {
      const res = await http().get('/audit/export').query({ actorId: actor, severity: 'notable' }).set('Cookie', auditor.cookie).expect(200);
      const lines = res.text.slice(1).trim().split('\r\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(',salary,');
    });

    it('the Auditor may export; staff without the audit trail may not', async () => {
      await http().get('/audit/export').query({ actorId: actor }).set('Cookie', auditor.cookie).expect(200);
      await http().get('/audit/export').query({ actorId: actor }).set('Cookie', hr.cookie).expect(403);
      await http().get('/audit/export').query({ actorId: actor }).expect(401);
    });
  });
});
