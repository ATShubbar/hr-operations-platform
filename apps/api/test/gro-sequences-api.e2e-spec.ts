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

// MOB-02 (ADR-018): the sequences API. Staff only — gro.process starts, files,
// reopens and cancels; gro.read reads; the Auditor reads and changes nothing.
// CLIENT MANAGERS HOLD gro.read (for the status-only procedure view), so the read
// route is refused by its staff-only check, not by the permission — this spec
// signs in as a real client manager to prove it. Responses are exact whitelists.
const MARK = 'MOB-02-test';
const RUN_KEYS = [
  'cancelledAt',
  'completedAt',
  'employeeId',
  'id',
  'kind',
  'startedBy',
  'startedOn',
  'status',
  'steps',
];
const STEP_KEYS = [
  'day',
  'fee',
  'filedBy',
  'filedOn',
  'key',
  'needs',
  'portal',
  'state',
  'target',
  'waitingOn',
];
const NOBODY = '33333333-3333-4333-8333-0000000000e3';

describe('Sequences API (MOB-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let co = '';
  const ids = { a: '', b: '', c: '' };
  const p = {} as Record<'admin' | 'hr' | 'gro' | 'auditor' | 'manager', TestPrincipal>;
  let me: TestPrincipal;

  const http = () => request(app.getHttpServer());
  const start = (who: TestPrincipal, employeeId: string, body: object = { kind: 'final_exit' }) =>
    http().post(`/employees/${employeeId}/sequences`).set('Cookie', who.cookie).send(body);
  const file = (who: TestPrincipal, id: string, key: string, body: object = {}) =>
    http().post(`/gro-sequences/${id}/steps/${key}/file`).set('Cookie', who.cookie).send(body);
  const reopen = (who: TestPrincipal, id: string, key: string) =>
    http().post(`/gro-sequences/${id}/steps/${key}/reopen`).set('Cookie', who.cookie);
  const cancel = (who: TestPrincipal, id: string) =>
    http().post(`/gro-sequences/${id}/cancel`).set('Cookie', who.cookie);
  const list = (who: TestPrincipal, employeeId: string) =>
    http().get(`/employees/${employeeId}/sequences`).set('Cookie', who.cookie);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await cleanup();
    co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    await owner.clientSetting.create({
      data: { clientId: co, key: 'flag.employee-self-service', value: true },
    });
    const mk = async (name: string) =>
      (
        await owner.employee.create({
          data: {
            clientId: co,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality: 'IN',
            contractType: 'unlimited',
          },
        })
      ).id;
    ids.a = await mk('a');
    ids.b = await mk('b');
    ids.c = await mk('c');
    p.admin = await loginAsEnrolledStaff(app, 'administrator');
    p.hr = await loginAsStaff(app, 'hr_officer');
    p.gro = await loginAsStaff(app, 'gro_officer');
    p.auditor = await loginAsEnrolledStaff(app, 'auditor');
    p.manager = await loginAsClientRep(app, co);
    me = await loginAsEmployee(app, ids.a);
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
    await owner.employee.deleteMany({ where: { id: { in: emps } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanup();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('the GRO officer starts, the HR officer files, the Administrator reopens — exact keys, names not ids', async () => {
    const started = await start(p.gro, ids.a).expect(201);
    expect(Object.keys(started.body).sort()).toEqual(RUN_KEYS);
    expect(started.body).toMatchObject({
      employeeId: ids.a,
      kind: 'final_exit',
      status: 'running',
      completedAt: null,
    });
    expect(started.body.steps).toHaveLength(8);
    for (const s of started.body.steps) expect(Object.keys(s).sort()).toEqual(STEP_KEYS);
    expect(started.body.steps[1]).toMatchObject({
      key: 'clearance',
      state: 'blocked',
      waitingOn: ['notice'],
      fee: 0,
    });
    expect(started.body.startedBy).toHaveProperty('name');
    const id = started.body.id as string;

    const filed = await file(p.hr, id, 'notice').expect(200);
    const notice = filed.body.steps.find((s: { key: string }) => s.key === 'notice');
    expect(notice).toMatchObject({
      state: 'filed',
      filedOn: new Date().toISOString().slice(0, 10),
    });
    expect(notice.filedBy).toHaveProperty('name');

    const back = await reopen(p.admin, id, 'notice').expect(200);
    expect(back.body.steps[0]).toMatchObject({ state: 'ready', filedOn: null, filedBy: null });

    const read = await list(p.auditor, ids.a).expect(200);
    expect(read.body.sequences.map((s: { id: string }) => s.id)).toContain(id);
  });

  it('the service rules come through as 409s: duplicate, blocked, dependent, finished', async () => {
    const id = (await list(p.gro, ids.a).expect(200)).body.sequences[0].id as string;
    await start(p.gro, ids.a).expect(409);
    await file(p.gro, id, 'settlement').expect(409);
    await file(p.gro, id, 'notice').expect(200);
    await file(p.gro, id, 'clearance').expect(200);
    await reopen(p.gro, id, 'notice').expect(409);
    await cancel(p.gro, id).expect(200);
    await cancel(p.gro, id).expect(409);
    await file(p.gro, id, 'settlement').expect(409);
  });

  it('validates: unknown kind / extra fields / bad dates 400; unknown step 400; malformed or unknown ids 404', async () => {
    await start(p.gro, ids.b, { kind: 'transfer' }).expect(400);
    await start(p.gro, ids.b, { kind: 'onboarding', startedOn: '2026-01-01' }).expect(400);
    await start(p.gro, NOBODY, { kind: 'onboarding' }).expect(404);
    await start(p.gro, 'not-a-uuid', { kind: 'onboarding' }).expect(404);
    await list(p.gro, 'not-a-uuid').expect(404);
    await list(p.gro, NOBODY).expect(404);
    const id = (await start(p.gro, ids.b, { kind: 'onboarding' }).expect(201)).body.id as string;
    await file(p.gro, id, 'block-visa', { filedOn: '2026-02-30' }).expect(400);
    await file(p.gro, id, 'block-visa', { filedOn: '2026-10-01', note: 'x' }).expect(400);
    await file(p.gro, id, 'no-such-step').expect(400);
    await file(p.gro, NOBODY, 'block-visa').expect(404);
    await file(p.gro, 'not-a-uuid', 'block-visa').expect(404);
    await cancel(p.gro, NOBODY).expect(404);
  });

  it('the Auditor reads but changes nothing', async () => {
    const id = (await list(p.gro, ids.b).expect(200)).body.sequences[0].id as string;
    await list(p.auditor, ids.b).expect(200);
    await start(p.auditor, ids.c, { kind: 'onboarding' }).expect(403);
    await file(p.auditor, id, 'block-visa').expect(403);
    await reopen(p.auditor, id, 'block-visa').expect(403);
    await cancel(p.auditor, id).expect(403);
  });

  it("a CLIENT MANAGER — who holds gro.read — is refused everything, the read included, for their own company's people", async () => {
    const id = (await list(p.gro, ids.b).expect(200)).body.sequences[0].id as string;
    await list(p.manager, ids.b).expect(403);
    await start(p.manager, ids.c, { kind: 'onboarding' }).expect(403);
    await file(p.manager, id, 'block-visa').expect(403);
    await reopen(p.manager, id, 'block-visa').expect(403);
    await cancel(p.manager, id).expect(403);
  });

  it('an employee is refused everything, even about themselves', async () => {
    const id = (await list(p.gro, ids.b).expect(200)).body.sequences[0].id as string;
    await list(me, ids.a).expect(403);
    await start(me, ids.a, { kind: 'onboarding' }).expect(403);
    await file(me, id, 'block-visa').expect(403);
    await cancel(me, id).expect(403);
  });

  it("sequence changes appear on the person's History, naming the sequence and the step — never on a colleague's", async () => {
    const mine = await http()
      .get(`/employees/${ids.a}/history`)
      .set('Cookie', p.hr.cookie)
      .expect(200);
    const entries = (
      mine.body.entries as Array<{ resource: string; action: string; subject: unknown }>
    ).filter((e) => e.resource === 'gro-sequence');
    // Newest first: cancel, file clearance, file notice, reopen notice, file notice, start.
    expect(entries.map((e) => e.action)).toEqual([
      'cancel',
      'file-step',
      'file-step',
      'reopen-step',
      'file-step',
      'start',
    ]);
    expect(entries[0]!.subject).toEqual({
      kind: 'gro-sequence',
      sequence: 'final_exit',
      step: null,
    });
    expect(entries[1]!.subject).toEqual({
      kind: 'gro-sequence',
      sequence: 'final_exit',
      step: 'clearance',
    });
    expect(entries.at(-1)!.subject).toEqual({
      kind: 'gro-sequence',
      sequence: 'final_exit',
      step: null,
    });
    // Curated as ever: no snapshot keys ride along.
    expect(JSON.stringify(mine.body)).not.toContain('sequenceId');

    const other = await http()
      .get(`/employees/${ids.c}/history`)
      .set('Cookie', p.hr.cookie)
      .expect(200);
    expect(
      (other.body.entries as Array<{ resource: string }>).some(
        (e) => e.resource === 'gro-sequence',
      ),
    ).toBe(false);
  });

  it('every change is audited against the employee', async () => {
    const actions = (
      await owner.auditEntry.findMany({
        where: { resource: 'gro-sequence', resourceId: ids.a },
        orderBy: { id: 'asc' },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual([
      'start',
      'file-step',
      'reopen-step',
      'file-step',
      'file-step',
      'cancel',
    ]);
  });
});
