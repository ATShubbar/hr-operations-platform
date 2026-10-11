import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { EscalationLadderResponse } from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// DEP-06a (ADR-017 rev. 2): a dependant's iqama renewal as a PROCEDURE on the
// sponsoring employee. It names ONE dependant; while it is open that dependant's
// iqama is quiet in the ladder; completing it writes the new date to the
// dependant; removing the dependant cancels it. And a client manager — who may
// read their company's other procedures — never sees one: it would say a family
// exists (ADR-017: clients see nothing of a family).
const MARK = 'DEP-06-test';
const TYPE = 'dependant_iqama_renewal';
const NOBODY = '33333333-3333-4333-8333-0000000000d6';
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
const day = (offset: number): Date => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

async function cleanup(owner: PrismaClient) {
  const clients = (
    await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
  ).map((c) => c.id);
  const where = { clientId: { in: clients } };
  const emps = (await owner.employee.findMany({ where, select: { id: true } })).map((e) => e.id);
  await owner.fee.deleteMany({ where });
  await owner.groProcess.deleteMany({ where });
  await owner.dependant.deleteMany({ where: { employeeId: { in: emps } } });
  await owner.employee.deleteMany({ where: { id: { in: emps } } });
  await owner.clientSetting.deleteMany({ where });
  await owner.client.deleteMany({ where: { id: { in: clients } } });
}

describe('A dependant’s iqama renewal as a procedure (DEP-06a, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let rep: TestPrincipal;
  let me: TestPrincipal;
  const ids = { co: '', a: '', b: '', wife: '', son: '', gone: '', bWife: '' };

  const http = () => request(app.getHttpServer());
  const start = (who: TestPrincipal, body: object) =>
    http().post('/gro-processes').set('Cookie', who.cookie).send(body);
  const move = (who: TestPrincipal, id: string, status: string) =>
    http().post(`/gro-processes/${id}/status`).set('Cookie', who.cookie).send({ status });
  const ladder = async (path: string, who: TestPrincipal): Promise<EscalationLadderResponse> =>
    (await http().get(path).set('Cookie', who.cookie).expect(200)).body;
  const has = (l: EscalationLadderResponse, key: string) => l.items.some((i) => i.key === key);
  const cancelOpen = () =>
    owner.groProcess.updateMany({
      where: { clientId: ids.co, status: { notIn: ['completed', 'cancelled'] } },
      data: { status: 'cancelled' },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    await cleanup(owner);
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Co` } })).id;
    const person = async (name: string) =>
      (
        await owner.employee.create({
          data: { clientId: ids.co, nameAr: 'اختبار', nameEn: `${MARK} ${name}`, nationality: 'IN', contractType: 'unlimited', iqamaExpiry: day(400) },
        })
      ).id;
    ids.a = await person('a');
    ids.b = await person('b');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    const dep = async (employeeId: string, name: string, over: object = {}) =>
      (
        await owner.dependant.create({
          data: { employeeId, relationship: 'spouse', nameEn: `${MARK} ${name}`, nameAr: 'زوجة', iqamaExpiry: day(-3), ...over },
        })
      ).id;
    ids.wife = await dep(ids.a, 'wife'); // lapsed three days ago
    ids.son = await dep(ids.a, 'son', { relationship: 'son', iqamaExpiry: day(5) });
    ids.gone = await dep(ids.a, 'removed', { relationship: 'daughter', removedAt: new Date(), removedByUserId: hr.userId });
    ids.bWife = await dep(ids.b, 'colleague wife');
    await owner.clientSetting.createMany({
      data: [
        { clientId: ids.co, key: 'flag.client-self-service', value: true },
        { clientId: ids.co, key: 'flag.employee-self-service', value: true },
      ],
    });
    rep = await loginAsClientRep(app, ids.co, 'client_manager');
    me = await loginAsEmployee(app, ids.a);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup(owner);
    await owner.$disconnect();
    await app.close();
  });

  it('starts on the sponsor, names the dependant, and refuses anything that is not that sponsor’s current dependant', async () => {
    const res = await start(gro, { employeeId: ids.a, type: TYPE, dependantId: ids.wife }).expect(201);
    expect(res.body).toMatchObject({
      clientId: ids.co,
      employeeId: ids.a,
      type: TYPE,
      status: 'not_started',
      dependant: { id: ids.wife, nameEn: `${MARK} wife`, nameAr: 'زوجة' },
    });
    // An ordinary procedure names nobody.
    const plain = await start(gro, { employeeId: ids.a, type: 'exit_reentry' }).expect(201);
    expect(plain.body.dependant).toBeNull();

    await start(gro, { employeeId: ids.a, type: TYPE }).expect(400); // no dependant named
    await start(gro, { employeeId: ids.a, type: 'iqama_renewal', dependantId: ids.wife }).expect(400); // wrong type for one
    await start(gro, { employeeId: ids.a, type: TYPE, dependantId: ids.bWife }).expect(404); // a colleague's wife
    await start(gro, { employeeId: ids.a, type: TYPE, dependantId: ids.gone }).expect(404); // removed
    await start(gro, { employeeId: ids.a, type: TYPE, dependantId: NOBODY }).expect(404);
  });

  it('one open renewal per dependant; another may start once it is finished', async () => {
    await start(hr, { employeeId: ids.a, type: TYPE, dependantId: ids.wife }).expect(409);
    // A different dependant of the same sponsor is a different renewal.
    const son = await start(hr, { employeeId: ids.a, type: TYPE, dependantId: ids.son }).expect(201);
    await move(hr, son.body.id, 'cancelled').expect(200);
    await start(hr, { employeeId: ids.a, type: TYPE, dependantId: ids.son }).expect(201);
  });

  it('the database ties the type to a named dependant, for any writer', async () => {
    const base = { clientId: ids.co, employeeId: ids.a };
    await expect(owner.groProcess.create({ data: { ...base, type: TYPE } })).rejects.toThrow();
    await expect(
      owner.groProcess.create({ data: { ...base, type: 'iqama_renewal', dependantId: ids.wife } }),
    ).rejects.toThrow();
  });

  it('a client manager never sees one — not in their list, not by id — while their other procedures stay', async () => {
    const mine = await owner.groProcess.findMany({ where: { clientId: ids.co } });
    const renewals = mine.filter((p) => p.type === TYPE);
    expect(renewals.length).toBeGreaterThanOrEqual(2);
    const list = await http().get('/gro-processes').set('Cookie', rep.cookie).expect(200);
    const seen: { id: string; type: string }[] = list.body.processes;
    expect(seen.map((p) => p.type)).toEqual(['exit_reentry']); // the ordinary one, and only it
    expect(JSON.stringify(list.body)).not.toContain(TYPE);
    expect(JSON.stringify(list.body)).not.toContain(ids.wife);
    for (const r of renewals) {
      await http().get(`/gro-processes/${r.id}`).set('Cookie', rep.cookie).expect(404);
    }
    // Staff still see all of them, named.
    const staff = await http().get(`/gro-processes?clientId=${ids.co}`).set('Cookie', hr.cookie).expect(200);
    expect(staff.body.processes.filter((p: { type: string }) => p.type === TYPE)).toHaveLength(renewals.length);
  });

  it('while it is open the dependant’s iqama is quiet — for staff and for the sponsor — and only that dependant’s', async () => {
    await cancelOpen();
    const wifeKey = `dependant:${ids.wife}:iqama`;
    const sonKey = `dependant:${ids.son}:iqama`;
    const before = await ladder('/escalations', hr);
    expect(has(before, wifeKey) && has(before, sonKey)).toBe(true);
    expect(has(await ladder('/me/escalations', me), wifeKey)).toBe(true);

    await start(gro, { employeeId: ids.a, type: TYPE, dependantId: ids.wife }).expect(201);
    const during = await ladder('/escalations', hr);
    expect(has(during, wifeKey)).toBe(false);
    expect(has(during, sonKey)).toBe(true);
    expect(during.suppressed).toBe(before.suppressed + 1);
    const own = await ladder('/me/escalations', me);
    expect(has(own, wifeKey)).toBe(false);
    expect(has(own, sonKey)).toBe(true);
    // The employee is shown no procedure, quiet or not.
    expect(own.items.some((i) => i.subject.kind === 'procedure')).toBe(false);
  });

  it('completing it writes the new date to THAT dependant, audited against the sponsor', async () => {
    const open = await owner.groProcess.findFirstOrThrow({
      where: { dependantId: ids.wife, status: { notIn: ['completed', 'cancelled'] } },
    });
    await http().patch(`/gro-processes/${open.id}`).set('Cookie', gro.cookie).send({ resultingExpiry: '2027-11-30' }).expect(200);
    for (const status of ['in_progress', 'submitted', 'approved', 'completed']) {
      await move(gro, open.id, status).expect(200);
    }
    const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;
    expect(iso((await owner.dependant.findUniqueOrThrow({ where: { id: ids.wife } })).iqamaExpiry)).toBe('2027-11-30');
    // Nobody else's date moved: not the son's, not the sponsor's own iqama.
    expect(iso((await owner.dependant.findUniqueOrThrow({ where: { id: ids.son } })).iqamaExpiry)).toBe(iso(day(5)));
    expect(iso((await owner.employee.findUniqueOrThrow({ where: { id: ids.a } })).iqamaExpiry)).toBe(iso(day(400)));
    const audit = await owner.auditEntry.findMany({
      where: { resource: 'dependant', resourceId: ids.a, action: 'update' },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    // With the date renewed, the item is gone from the ladder for the plain reason.
    expect(has(await ladder('/escalations', hr), `dependant:${ids.wife}:iqama`)).toBe(false);
  });

  it('removing a dependant cancels their open renewal', async () => {
    await cancelOpen();
    const p = await start(gro, { employeeId: ids.a, type: TYPE, dependantId: ids.son }).expect(201);
    await http().post(`/employees/${ids.a}/dependants/${ids.son}/remove`).set('Cookie', hr.cookie).expect(204);
    expect((await owner.groProcess.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe('cancelled');
  });
});
