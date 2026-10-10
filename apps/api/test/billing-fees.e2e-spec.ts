import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_STANDARD_FEES, STANDARD_FEES_KEY } from '@hr/contracts';
import { AppModule } from '../src/app.module';
import { PolicyService } from '../src/modules/auth/public-api';
import { SEQUENCES } from '../src/modules/gro/public-api';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// BILL-01 (ADR-020): the ledger of government fees paid on clients' behalf.
// Staff keep it (`fee.*`: Administrator, HR officer, GRO officer; the Auditor
// reads); client managers and employees have no view of it, at the API or at
// the database. A fee is recorded once per step or procedure, corrected only
// while `recorded`, and never deleted — it is voided, with a reason. Money is
// whole halalas.
const MARK = 'BILL-01-test';
const day = (offset: number): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const db = (url?: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });

const FEE_KEYS = [
  'amountHalalas',
  'authority',
  'clientId',
  'employee',
  'id',
  'paidOn',
  'recordedAt',
  'recordedBy',
  'ref',
  'source',
  'status',
  'voided',
];

describe('Government fee ledger (BILL-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let staffDb: PrismaClient;
  let clientDb: PrismaClient;
  let employeeDb: PrismaClient;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let rep: TestPrincipal;
  let employee: TestPrincipal;
  const ids = { co: '', other: '', a: '', b: '', outsider: '', sequence: '', process: '' };

  const http = () => request(app.getHttpServer());
  const post = (body: unknown, who: TestPrincipal = hr) =>
    http()
      .post('/fees')
      .set('Cookie', who.cookie)
      .send(body as object);
  const manual = (over: Record<string, unknown> = {}) => ({
    source: { kind: 'manual', clientId: ids.co, label: 'Chamber of Commerce attestation' },
    authority: 'chamber',
    amountHalalas: 15_000,
    paidOn: day(-2),
    ...over,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    staffDb = db(process.env.STAFF_DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    employeeDb = db(process.env.EMPLOYEE_DATABASE_URL);
    await cleanup();
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    ids.other = (await owner.client.create({ data: { nameAr: 'أخرى', nameEn: `${MARK} Y` } })).id;
    const mk = async (clientId: string, name: string) =>
      (
        await owner.employee.create({
          data: {
            clientId,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality: 'IN',
            contractType: 'unlimited',
          },
        })
      ).id;
    ids.a = await mk(ids.co, 'a');
    ids.b = await mk(ids.co, 'b');
    ids.outsider = await mk(ids.other, 'outsider');
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    rep = await loginAsClientRep(app, ids.co, 'client_manager');
    employee = await loginAsEmployee(app, ids.a);
    await owner.authUser.update({ where: { id: hr.userId }, data: { displayName: 'Omar Test' } });

    ids.sequence = (
      await http()
        .post(`/employees/${ids.a}/sequences`)
        .set('Cookie', gro.cookie)
        .send({ kind: 'onboarding' })
        .expect(201)
    ).body.id as string;
    ids.process = (
      await http()
        .post('/gro-processes')
        .set('Cookie', gro.cookie)
        .send({ employeeId: ids.b, type: 'iqama_renewal' })
        .expect(201)
    ).body.id as string;
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    const runs = (
      await owner.groSequence.findMany({ where: { clientId: { in: cos } }, select: { id: true } })
    ).map((r) => r.id);
    await owner.fee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.groSequenceStep.deleteMany({ where: { sequenceId: { in: runs } } });
    await owner.groSequence.deleteMany({ where: { id: { in: runs } } });
    await owner.groProcess.deleteMany({ where: { clientId: { in: cos } } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
    await owner.systemSetting.deleteMany({ where: { key: STANDARD_FEES_KEY } });
  }

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await Promise.all([owner, staffDb, clientDb, employeeDb].map((c) => c.$disconnect()));
    await app.close();
  });

  it('an officer records a company-level fee by hand: it reads back, is numbered, names its recorder, and is audited', async () => {
    const res = await post(manual()).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(FEE_KEYS);
    expect(res.body).toMatchObject({
      clientId: ids.co,
      employee: null,
      source: { kind: 'manual', label: 'Chamber of Commerce attestation' },
      authority: 'chamber',
      amountHalalas: 15_000,
      paidOn: day(-2),
      status: 'recorded',
      recordedBy: 'Omar Test',
      voided: null,
    });
    expect(res.body.ref).toMatch(/^GF-\d{4,}$/);

    const list = await http()
      .get('/fees')
      .query({ clientId: ids.co })
      .set('Cookie', auditor.cookie)
      .expect(200);
    expect((list.body.fees as Array<{ id: string }>).map((f) => f.id)).toEqual([res.body.id]);

    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { resource: 'fee', resourceId: res.body.id },
    });
    expect(entry).toMatchObject({ action: 'create', clientId: ids.co, actorId: hr.userId });
    expect(entry.after).toMatchObject({ ref: res.body.ref, amountHalalas: 15_000 });
  });

  it('a manual fee may name a person AT that company — never one somewhere else', async () => {
    const mine = await post(
      manual({ source: { kind: 'manual', clientId: ids.co, employeeId: ids.b, label: 'Licence' } }),
    ).expect(201);
    expect(mine.body.employee).toMatchObject({ id: ids.b, name: { en: `${MARK} b` } });
    await post(
      manual({
        source: { kind: 'manual', clientId: ids.co, employeeId: ids.outsider, label: 'Licence' },
      }),
    ).expect(400);
    await post(
      manual({
        source: {
          kind: 'manual',
          clientId: '99999999-9999-4999-8999-999999999999',
          label: 'Licence',
        },
      }),
    ).expect(404);
  });

  it('a fee for a sequence step needs the step FILED, takes its company and person from the run, and is recorded once', async () => {
    const stepFee = {
      source: { kind: 'sequence_step', sequenceId: ids.sequence, stepKey: 'block-visa' },
      amountHalalas: 200_000,
      paidOn: day(-1),
    };
    await post(stepFee).expect(409); // not filed yet
    await http()
      .post(`/gro-sequences/${ids.sequence}/steps/block-visa/file`)
      .set('Cookie', gro.cookie)
      .send({})
      .expect(200);
    const res = await post(stepFee, gro).expect(201);
    expect(res.body).toMatchObject({
      clientId: ids.co,
      employee: { id: ids.a },
      source: {
        kind: 'sequence_step',
        sequenceId: ids.sequence,
        sequenceKind: 'onboarding',
        stepKey: 'block-visa',
      },
      authority: 'qiwa', // the step's portal, when the caller names none
      amountHalalas: 200_000,
    });
    await post(stepFee).expect(409); // once per step
    await post({ ...stepFee, source: { ...stepFee.source, stepKey: 'no-such-step' } }).expect(404);
    await post({
      ...stepFee,
      source: { ...stepFee.source, sequenceId: '99999999-9999-4999-8999-999999999999' },
    }).expect(404);
    expect(
      await owner.fee.count({ where: { sequenceId: ids.sequence, stepKey: 'block-visa' } }),
    ).toBe(1);
  });

  it('a fee for a procedure takes its company and person from the procedure, needs an authority, and is recorded once', async () => {
    const procFee = {
      source: { kind: 'procedure', processId: ids.process },
      authority: 'muqeem',
      amountHalalas: 970_000,
      paidOn: day(0),
    };
    await post({ ...procFee, authority: undefined }).expect(400);
    const res = await post(procFee).expect(201);
    expect(res.body).toMatchObject({
      clientId: ids.co,
      employee: { id: ids.b },
      source: { kind: 'procedure', processId: ids.process, procedureType: 'iqama_renewal' },
      authority: 'muqeem',
    });
    await post(procFee).expect(409);
    await post({
      ...procFee,
      source: { kind: 'procedure', processId: '99999999-9999-4999-8999-999999999999' },
    }).expect(404);
  });

  it('refuses what is not a fee (400) and records nothing', async () => {
    const before = await owner.fee.count({ where: { clientId: ids.co } });
    const bad: unknown[] = [
      manual({ amountHalalas: 0 }),
      manual({ amountHalalas: -500 }),
      manual({ amountHalalas: 150.5 }), // whole halalas only
      manual({ amountHalalas: 100_000_001 }), // above SAR 1,000,000
      manual({ amountHalalas: '15000' }),
      manual({ paidOn: day(3) }), // not paid yet
      manual({ paidOn: '2026-02-30' }),
      manual({ authority: 'ministry-of-magic' }),
      manual({ authority: undefined }), // a manual fee says who was paid
      manual({ source: { kind: 'manual', clientId: ids.co, label: '   ' } }),
      manual({ source: { kind: 'manual', clientId: ids.co } }),
      manual({ source: { kind: 'invoice', clientId: ids.co, label: 'x' } }),
      manual({ status: 'invoiced' }), // not the caller's to set
      manual({ ref: 'GF-0001' }),
      {},
    ];
    for (const body of bad) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await owner.fee.count({ where: { clientId: ids.co } })).toBe(before);
  });

  it('a recorded fee can be corrected — the amount, the day, the authority; a manual fee its wording — and the change is audited', async () => {
    const fee = (await post(manual({ amountHalalas: 60_000 })).expect(201)).body;
    const res = await http()
      .patch(`/fees/${fee.id}`)
      .set('Cookie', gro.cookie)
      .send({ amountHalalas: 65_000, paidOn: day(-5), authority: 'balady', label: 'Licence fee' })
      .expect(200);
    expect(res.body).toMatchObject({
      amountHalalas: 65_000,
      paidOn: day(-5),
      authority: 'balady',
      source: { kind: 'manual', label: 'Licence fee' },
      recordedBy: 'Omar Test', // still the person who recorded it
    });
    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { resource: 'fee', resourceId: fee.id, action: 'update' },
    });
    expect(entry.before).toMatchObject({ amountHalalas: 60_000 });
    expect(entry.after).toMatchObject({ amountHalalas: 65_000 });
    expect(entry.actorId).toBe(gro.userId);

    // A step's fee has no wording of its own; nothing invalid is accepted; unknown → 404.
    const stepFee = await owner.fee.findFirstOrThrow({ where: { sequenceId: ids.sequence } });
    await http()
      .patch(`/fees/${stepFee.id}`)
      .set('Cookie', hr.cookie)
      .send({ label: 'Renamed' })
      .expect(400);
    for (const body of [{}, { amountHalalas: 0 }, { paidOn: day(2) }, { status: 'void' }]) {
      await http().patch(`/fees/${fee.id}`).set('Cookie', hr.cookie).send(body).expect(400);
    }
    await http()
      .patch('/fees/99999999-9999-4999-8999-999999999999')
      .set('Cookie', hr.cookie)
      .send({ amountHalalas: 1 })
      .expect(404);
  });

  it('a fee is voided with a reason, never deleted: it stays in the ledger, cannot be changed again, and frees its step', async () => {
    const stepFee = await owner.fee.findFirstOrThrow({ where: { sequenceId: ids.sequence } });
    const voidIt = (body: unknown, who = hr) =>
      http()
        .post(`/fees/${stepFee.id}/void`)
        .set('Cookie', who.cookie)
        .send(body as object);
    await voidIt({}).expect(400);
    await voidIt({ reason: 'x' }).expect(400);
    const res = await voidIt({ reason: 'Recorded against the wrong step' }).expect(200);
    expect(res.body).toMatchObject({
      status: 'void',
      amountHalalas: 200_000, // the amount stays on the record
      voided: { by: 'Omar Test', reason: 'Recorded against the wrong step' },
    });
    expect(await owner.fee.count({ where: { id: stepFee.id } })).toBe(1);
    await voidIt({ reason: 'again' }).expect(409);
    await http()
      .patch(`/fees/${stepFee.id}`)
      .set('Cookie', hr.cookie)
      .send({ amountHalalas: 1 })
      .expect(409);
    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { resource: 'fee', resourceId: stepFee.id, action: 'void' },
    });
    expect(entry.after).toMatchObject({ status: 'void' });

    // The step is free again: its fee can be recorded afresh.
    await post({
      source: { kind: 'sequence_step', sequenceId: ids.sequence, stepKey: 'block-visa' },
      amountHalalas: 210_000,
      paidOn: day(0),
    }).expect(201);
    expect(
      await owner.fee.count({ where: { sequenceId: ids.sequence, stepKey: 'block-visa' } }),
    ).toBe(2);
  });

  it('the list filters by company, person, status and the day paid — and never mixes companies', async () => {
    const other = await post(
      manual({ source: { kind: 'manual', clientId: ids.other, label: 'Other company' } }),
    ).expect(201);
    const get = async (query: Record<string, string>) =>
      (
        (await http().get('/fees').query(query).set('Cookie', hr.cookie).expect(200)).body
          .fees as Array<{ id: string; clientId: string; status: string; paidOn: string }>
      ).map((f) => f);

    const mine = await get({ clientId: ids.co });
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(mine.every((f) => f.clientId === ids.co)).toBe(true);
    expect(mine.map((f) => f.id)).not.toContain(other.body.id);
    // Newest payment first.
    expect(mine.map((f) => f.paidOn)).toEqual([...mine.map((f) => f.paidOn)].sort().reverse());

    const voided = await get({ clientId: ids.co, status: 'void' });
    expect(voided).toHaveLength(1);
    expect((await get({ clientId: ids.co, status: 'recorded' })).length).toBe(mine.length - 1);
    expect((await get({ employeeId: ids.b })).length).toBe(2); // the licence and the procedure
    const recent = await get({ clientId: ids.co, from: day(-1) });
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.every((f) => f.paidOn >= day(-1))).toBe(true);
    expect(recent.length).toBeLessThan(mine.length);
    await http().get('/fees').query({ status: 'paid' }).set('Cookie', hr.cookie).expect(400);
    await http().get('/fees').query({ client: ids.co }).set('Cookie', hr.cookie).expect(400);
  });

  it('who: officers and the Administrator keep the ledger; the Auditor only reads; clients, employees and strangers get nothing', async () => {
    const fee = (await post(manual(), admin).expect(201)).body;
    await http().get('/fees').set('Cookie', auditor.cookie).expect(200);
    await post(manual(), auditor).expect(403);
    await http()
      .patch(`/fees/${fee.id}`)
      .set('Cookie', auditor.cookie)
      .send({ amountHalalas: 1 })
      .expect(403);
    await http()
      .post(`/fees/${fee.id}/void`)
      .set('Cookie', auditor.cookie)
      .send({ reason: 'not mine to void' })
      .expect(403);
    for (const who of [rep, employee]) {
      await http().get('/fees').set('Cookie', who.cookie).expect(403);
      await post(manual(), who).expect(403);
      await http()
        .patch(`/fees/${fee.id}`)
        .set('Cookie', who.cookie)
        .send({ amountHalalas: 1 })
        .expect(403);
      await http()
        .post(`/fees/${fee.id}/void`)
        .set('Cookie', who.cookie)
        .send({ reason: 'not mine' })
        .expect(403);
    }
    await http().get('/fees').expect(401);
    await http().post('/fees').send(manual()).expect(401);
    expect((await owner.fee.findUniqueOrThrow({ where: { id: fee.id } })).status).toBe('recorded');
  });

  it('the standard fees are a setting: seeded from the prototype, complete, and only the Administrator changes them', async () => {
    const read = async (who: TestPrincipal) =>
      (await http().get('/config').set('Cookie', who.cookie).expect(200)).body.settings[
        STANDARD_FEES_KEY
      ];
    expect(await read(hr)).toEqual(DEFAULT_STANDARD_FEES);
    // The defaults ARE the sequence definitions' fees — one source, in halalas.
    for (const kind of ['onboarding', 'final_exit'] as const) {
      expect(DEFAULT_STANDARD_FEES.steps[kind]).toEqual(
        Object.fromEntries(SEQUENCES[kind].steps.map((s) => [s.key, s.fee * 100])),
      );
    }

    const set = (value: unknown, who: TestPrincipal) =>
      http().patch(`/config/system/${STANDARD_FEES_KEY}`).set('Cookie', who.cookie).send({ value });
    const next = {
      ...DEFAULT_STANDARD_FEES,
      procedures: { ...DEFAULT_STANDARD_FEES.procedures, iqama_renewal: 1_000_000 },
    };
    await set(next, hr).expect(403);
    await set(next, auditor).expect(403);
    await set(next, admin).expect(200);
    expect((await read(gro)).procedures.iqama_renewal).toBe(1_000_000);
    // Incomplete, negative, fractional or unknown keys are refused.
    const { iqama_issue: _dropped, ...missing } = DEFAULT_STANDARD_FEES.procedures;
    for (const bad of [
      { ...next, procedures: missing },
      { ...next, dependantAnnual: -1 },
      { ...next, dependantAnnual: 10.5 },
      { ...next, steps: { ...next.steps, onboarding: { ...next.steps.onboarding, extra: 1 } } },
      { procedures: next.procedures },
    ]) {
      await set(bad, admin).expect(400);
    }
    // Changing a standard fee alters no fee already recorded.
    const proc = await owner.fee.findFirstOrThrow({ where: { processId: ids.process } });
    expect(proc.amountHalalas).toBe(970_000);
  });

  describe('the database itself', () => {
    it('client managers and employees cannot read or write the ledger', async () => {
      const asClient = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
        clientDb.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.client_id', ${ids.co}, true)`;
          return fn(tx as unknown as PrismaClient);
        });
      const asEmployee = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
        employeeDb.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.employee_id', ${ids.a}, true)`;
          return fn(tx as unknown as PrismaClient);
        });
      for (const scoped of [asClient, asEmployee]) {
        await expect(scoped((tx) => tx.fee.findMany())).rejects.toThrow(/permission denied/);
        await expect(
          scoped((tx) =>
            tx.fee.create({
              data: {
                clientId: ids.co,
                sourceKind: 'manual',
                label: 'forged',
                authority: 'other',
                amountHalalas: 1,
                paidOn: new Date(),
              },
            }),
          ),
        ).rejects.toThrow(/permission denied/);
      }
    });

    it('nobody deletes a fee — not even the staff connection', async () => {
      const fee = await owner.fee.findFirstOrThrow({ where: { clientId: ids.co } });
      await expect(staffDb.fee.delete({ where: { id: fee.id } })).rejects.toThrow(
        /permission denied/,
      );
    });

    it('refuses a malformed row whoever writes it (the CHECKs are the last line)', async () => {
      const raw = (sql: string) => owner.$executeRawUnsafe(sql);
      const base = `INSERT INTO bil_fees (client_id, source_kind, label, authority, amount_halalas, paid_on, updated_at)`;
      const co = `'${ids.co}'::uuid`;
      await expect(
        raw(`${base} VALUES (${co}, 'manual', 'x', 'other', 0, current_date, now())`),
      ).rejects.toThrow(); // amount must be positive
      await expect(
        raw(`${base} VALUES (${co}, 'manual', NULL, 'other', 100, current_date, now())`),
      ).rejects.toThrow(); // a manual fee needs its wording
      await expect(
        raw(`${base} VALUES (${co}, 'sequence_step', NULL, 'other', 100, current_date, now())`),
      ).rejects.toThrow(); // a step fee needs its step
      await expect(
        raw(`${base} VALUES (${co}, 'procedure', NULL, 'other', 100, current_date, now())`),
      ).rejects.toThrow(); // a procedure fee needs its procedure
      const fee = await owner.fee.findFirstOrThrow({
        where: { clientId: ids.co, status: 'recorded' },
      });
      await expect(
        raw(`UPDATE bil_fees SET status = 'void' WHERE id = '${fee.id}'::uuid`),
      ).rejects.toThrow(); // void needs who, when and why
      // One live fee per step, at the database.
      const live = await owner.fee.findFirstOrThrow({
        where: { sequenceId: ids.sequence, status: 'recorded' },
      });
      await expect(
        raw(
          `INSERT INTO bil_fees (client_id, employee_id, source_kind, sequence_id, sequence_kind, step_key, authority, amount_halalas, paid_on, updated_at)
           VALUES (${co}, '${ids.a}'::uuid, 'sequence_step', '${live.sequenceId}'::uuid, 'onboarding', 'block-visa', 'qiwa', 100, current_date, now())`,
        ),
      ).rejects.toThrow();
    });
  });
});

// The staff check, proven with a WIDENED policy: no client role holds `fee.*`
// today, so without this a missing `scopeOf` would never fail a test.
describe('Government fee ledger — staff only, even for a role that held the permissions (BILL-01)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let rep: TestPrincipal;
  let clientId = '';

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'client_manager' && permission.startsWith('fee.')) return true;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(WidenedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} widened` } }))
      .id;
    rep = await loginAsClientRep(app, clientId, 'client_manager');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await owner.fee.deleteMany({ where: { clientId } });
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted fee.* is still refused every route, for their OWN company', async () => {
    const http = () => request(app.getHttpServer());
    await http().get('/fees').query({ clientId }).set('Cookie', rep.cookie).expect(403);
    await http()
      .post('/fees')
      .set('Cookie', rep.cookie)
      .send({
        source: { kind: 'manual', clientId, label: 'Mine' },
        authority: 'other',
        amountHalalas: 100,
        paidOn: day(0),
      })
      .expect(403);
    await http()
      .patch('/fees/99999999-9999-4999-8999-999999999999')
      .set('Cookie', rep.cookie)
      .send({ amountHalalas: 1 })
      .expect(403);
    await http()
      .post('/fees/99999999-9999-4999-8999-999999999999/void')
      .set('Cookie', rep.cookie)
      .send({ reason: 'not mine' })
      .expect(403);
    expect(await owner.fee.count({ where: { clientId } })).toBe(0);
  });
});
