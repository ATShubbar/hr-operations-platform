import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmployeeHistoryResponse } from '@hr/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  HELPER_EMAIL_PREFIX,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// AUDIT-06: audit entries record WHICH record they are about, and
// GET /employees/:id/history reads one person's curated history from them.
//
// The load-bearing assertions:
//   - every listed write records its record id (employee, employee-user,
//     document, gro-process) — checked in aud_entries directly;
//   - the history holds THIS person's entries and none of a colleague's at the
//     same company, whose record, documents and GRO process all changed too;
//   - an entry carries exactly id/at/resource/action/actor/subject — never the
//     audit snapshots.

const MARK = 'audit06-';

describe('Employee history (AUDIT-06, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hr: TestPrincipal;
  let clientId: string;
  let me: string; // the subject
  let colleague: string; // same company
  let myDoc = '';
  let theirDoc = '';
  let myProc = '';
  let theirProc = '';

  const http = () => app.getHttpServer();
  const person = async (name: string) =>
    (
      await request(http())
        .post('/employees')
        .set('Cookie', hr.cookie)
        .send({
          clientId,
          name: { en: `${MARK}${name}`, ar: 'اختبار' },
          nationality: 'EG',
          contractType: 'unlimited',
        })
        .expect(201)
    ).body.id as string;

  // Changes to one employee across every resource the history covers.
  async function touch(employeeId: string): Promise<{ doc: string; proc: string }> {
    await request(http())
      .patch(`/employees/${employeeId}`)
      .set('Cookie', hr.cookie)
      .send({ department: 'Ops' })
      .expect(200);
    await request(http())
      .patch(`/employees/${employeeId}/govdata`)
      .set('Cookie', hr.cookie)
      .send({ iqamaExpiry: '2027-01-01' })
      .expect(200);
    const doc = (
      await request(http())
        .post('/documents')
        .set('Cookie', hr.cookie)
        .send({
          clientId,
          employeeId,
          category: 'passport',
          title: `${MARK}passport ${employeeId.slice(0, 4)}`,
          fileName: 'p.pdf',
          contentType: 'application/pdf',
          sizeBytes: 10,
        })
        .expect(201)
    ).body.document.id as string;
    const proc = (
      await request(http())
        .post('/gro-processes')
        .set('Cookie', hr.cookie)
        .send({ employeeId, type: 'iqama_renewal' })
        .expect(201)
    ).body.id as string;
    await request(http())
      .post(`/gro-processes/${proc}/status`)
      .set('Cookie', hr.cookie)
      .send({ status: 'in_progress' })
      .expect(200);
    return { doc, proc };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    hr = await loginAsStaff(app, 'hr_officer');
    clientId = (await prisma.client.create({ data: { nameAr: 'شركة سجل', nameEn: `${MARK}Co` } }))
      .id;
    // Self-service on, so an account can be invited (an employee-user entry).
    await prisma.clientSetting.create({
      data: { clientId, key: 'flag.employee-self-service', value: true },
    });
    me = await person('me');
    colleague = await person('colleague');
    ({ doc: myDoc, proc: myProc } = await touch(me));
    ({ doc: theirDoc, proc: theirProc } = await touch(colleague));
    await request(http())
      .post(`/employee-accounts/${me}/invite`)
      .set('Cookie', hr.cookie)
      .send({ email: `${HELPER_EMAIL_PREFIX}${randomUUID()}@example.com` })
      .expect(200);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await prisma.groProcess.deleteMany({ where: { employeeId: { in: [me, colleague] } } });
    await prisma.document.deleteMany({ where: { employeeId: { in: [me, colleague] } } });
    await prisma.employee.deleteMany({ where: { id: { in: [me, colleague] } } });
    await prisma.clientSetting.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await app.close();
  });

  const historyOf = async (id: string, cookie = hr.cookie) =>
    (await request(http()).get(`/employees/${id}/history`).set('Cookie', cookie).expect(200))
      .body as EmployeeHistoryResponse;

  it('every listed write records the id of the record it is about', async () => {
    const rows = await prisma.auditEntry.findMany({
      where: {
        OR: [
          { resource: 'employee', resourceId: me },
          { resource: 'employee-user', resourceId: me },
          { resource: 'document', resourceId: myDoc },
          { resource: 'gro-process', resourceId: myProc },
        ],
      },
      select: { resource: true, action: true },
    });
    const seen = new Set(rows.map((r) => `${r.resource}:${r.action}`));
    for (const k of [
      'employee:create',
      'employee:update',
      'employee:govdata-update',
      'employee-user:invite',
      'document:create',
      'gro-process:create',
      'gro-process:status',
    ]) {
      expect(seen, k).toContain(k);
    }
  });

  it("returns this person's history — and none of a same-company colleague's", async () => {
    const body = await historyOf(me);
    const kinds = new Set(body.entries.map((e) => `${e.resource}:${e.action}`));
    expect(kinds).toEqual(
      new Set([
        'employee:create',
        'employee:update',
        'employee:govdata-update',
        'employee-user:invite',
        'document:create',
        'gro-process:create',
        'gro-process:status',
      ]),
    );
    // The colleague's document and process changed in the same company, by the
    // same actor — neither may appear.
    const docTitles = body.entries.flatMap((e) =>
      e.subject?.kind === 'document' ? [e.subject.title] : [],
    );
    expect(docTitles.every((t) => t.includes(me.slice(0, 4)))).toBe(true);
    const other = await historyOf(colleague);
    expect(other.entries.length).toBe(body.entries.length - 1); // no account invite
    expect(JSON.stringify(other)).not.toContain(myDoc);
    expect(JSON.stringify(body)).not.toContain(theirDoc);
    expect(JSON.stringify(body)).not.toContain(theirProc);
  });

  it('is newest first, names the records it is about, and carries no snapshots', async () => {
    const body = await historyOf(me);
    const times = body.entries.map((e) => e.at);
    expect([...times].sort().reverse()).toEqual(times);
    for (const e of body.entries) {
      expect(Object.keys(e).sort()).toEqual(['action', 'actor', 'at', 'id', 'resource', 'subject']);
    }
    expect(JSON.stringify(body)).not.toMatch(/"before"|"after"|requestId|clientId|2027-01-01/);
    const proc = body.entries.find((e) => e.resource === 'gro-process');
    expect(proc?.subject).toEqual({ kind: 'gro-process', type: 'iqama_renewal' });
    const doc = body.entries.find((e) => e.resource === 'document');
    expect(doc?.subject).toMatchObject({ kind: 'document', category: 'passport' });
    expect(body.entries[0]?.actor?.role).toBe('hr_officer');
    expect(body.truncated).toBe(false);
  });

  it('every staff role reads it (employee.history)', async () => {
    for (const p of [
      await loginAsStaff(app, 'gro_officer'),
      await loginAsEnrolledStaff(app, 'auditor'),
      await loginAsEnrolledStaff(app, 'administrator'),
    ]) {
      await historyOf(me, p.cookie);
    }
  });

  it('client reps and employees are refused; unknown or malformed ids are 404; unauth 401', async () => {
    const rep = await loginAsClientRep(app, clientId, 'client_manager');
    await request(http()).get(`/employees/${me}/history`).set('Cookie', rep.cookie).expect(403);
    // The colleague: `me` already holds the account invited above (one per record).
    const emp = await loginAsEmployee(app, colleague);
    await request(http()).get(`/employees/${me}/history`).set('Cookie', emp.cookie).expect(403);
    await request(http())
      .get(`/employees/${randomUUID()}/history`)
      .set('Cookie', hr.cookie)
      .expect(404);
    await request(http()).get('/employees/nope/history').set('Cookie', hr.cookie).expect(404);
    await request(http()).get(`/employees/${me}/history`).expect(401);
  });
});
