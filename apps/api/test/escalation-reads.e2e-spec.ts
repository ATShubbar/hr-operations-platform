import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_ESCALATION_THRESHOLDS, type EscalationItem } from '@hr/contracts';
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
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// NC-02 (ADR-021): READ MARKS — the only thing the ladder stores. A mark
// remembers the item, the stage and the date it was about, per person. An item
// that climbs a stage, or whose date changes, is unread again. Nobody can mark
// an item they are not shown, and one person's marks are nobody else's.
const MARK = 'NC-02-test';
const db = (url?: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
const day = (offset: number): Date => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

describe('Read marks on the ladder (NC-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let clientDb: PrismaClient;
  let employeeDb: PrismaClient;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let rep: TestPrincipal;
  let employee: TestPrincipal;
  const ids = { co: '', a: '', b: '', taskGro: '' };
  const key = { iqama: '', passport: '', contract: '', lapsed: '', lapsedContract: '', task: '' };

  const http = () => request(app.getHttpServer());
  const ours = async (who: TestPrincipal): Promise<EscalationItem[]> =>
    (
      (await http().get('/escalations').set('Cookie', who.cookie).expect(200)).body
        .items as EscalationItem[]
    ).filter((i) => i.client?.id === ids.co);
  const item = async (who: TestPrincipal, k: string) => (await ours(who)).find((i) => i.key === k);
  const markRead = (keys: unknown, who: TestPrincipal = admin) =>
    http()
      .post('/escalations/read')
      .set('Cookie', who.cookie)
      .send({ keys } as object);
  const count = async (who: TestPrincipal): Promise<number> =>
    (await http().get('/escalations/count').set('Cookie', who.cookie).expect(200)).body.needsAction;
  const marksOf = (who: TestPrincipal) =>
    owner.escalationRead.findMany({ where: { userId: who.userId }, orderBy: { itemKey: 'asc' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    employeeDb = db(process.env.EMPLOYEE_DATABASE_URL);
    await cleanup();
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    const person = (name: string, over: object) =>
      owner.employee.create({
        data: {
          clientId: ids.co,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'IN',
          contractType: 'unlimited',
          ...over,
        },
      });
    ids.a = (
      await person('a', {
        iqamaExpiry: day(5), // escalated — needs action
        passportExpiry: day(20), // notice
        contractEndDate: day(12), // reminder
      })
    ).id;
    // b: a lapsed passport (the GRO officers') and a lapsed contract (the HR officers').
    ids.b = (await person('b', { passportExpiry: day(-4), contractEndDate: day(-3) })).id;
    ids.taskGro = (
      await owner.task.create({
        data: {
          clientId: ids.co,
          title: `${MARK} gro's task`,
          dueDate: day(-1),
          createdByUserId: gro.userId,
          assigneeUserId: gro.userId,
        },
      })
    ).id;
    key.iqama = `expiry:${ids.a}:iqama`;
    key.passport = `expiry:${ids.a}:passport`;
    key.contract = `expiry:${ids.a}:contract`;
    key.lapsed = `expiry:${ids.b}:passport`;
    key.lapsedContract = `expiry:${ids.b}:contract`;
    key.task = `task:${ids.taskGro}`;
    rep = await loginAsClientRep(app, ids.co, 'client_manager');
    employee = await loginAsEmployee(app, ids.a);
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    await owner.task.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    for (const who of [admin, hr, gro]) {
      await owner.escalationRead.deleteMany({ where: { userId: who.userId } });
    }
    await cleanupHelperUsers(app);
    await cleanup();
    await Promise.all([owner, clientDb, employeeDb].map((c) => c.$disconnect()));
    await app.close();
  });

  it('everything starts unread, and the count is the unread items that need action', async () => {
    const items = await ours(admin);
    expect(items.map((i) => i.read)).toEqual(items.map(() => false));
    expect(Object.keys(items[0] ?? {})).toContain('read');
    // The count is over the WHOLE ladder: unread, told to this person, at
    // Escalated or Breach. Checked for three roles, because each one tells a
    // different part of that rule apart from a looser one.
    const needing = async (who: TestPrincipal) =>
      (
        (await http().get('/escalations').set('Cookie', who.cookie).expect(200)).body
          .items as EscalationItem[]
      ).filter((i) => i.told && !i.read && (i.stage === 'escalation' || i.stage === 'breach'));
    for (const who of [admin, hr, gro]) expect(await count(who)).toBe((await needing(who)).length);
    expect((await needing(admin)).map((i) => i.key)).toEqual(
      expect.arrayContaining([key.iqama, key.lapsed, key.task]),
    );
    // An HR officer IS told about a Reminder — and it is not counted.
    expect(await item(hr, key.contract)).toMatchObject({ stage: 'reminder', told: true });
    expect((await needing(hr)).map((i) => i.key)).not.toContain(key.contract);
    // A GRO officer reads a lapsed contract that is the HR officers' — not told, not counted.
    expect(await item(gro, key.lapsedContract)).toMatchObject({ stage: 'breach', told: false });
    expect((await needing(gro)).map((i) => i.key)).not.toContain(key.lapsedContract);
    const res = await http().get('/escalations/count').set('Cookie', admin.cookie).expect(200);
    expect(Object.keys(res.body)).toEqual(['needsAction']);
  });

  it('marking an item read is for that person only, and lowers their count', async () => {
    const before = await count(admin);
    const hrBefore = await count(hr);
    const res = await markRead([key.iqama]).expect(200);
    expect(res.body).toEqual({ marked: 1 });

    expect((await item(admin, key.iqama))?.read).toBe(true);
    expect((await item(admin, key.lapsed))?.read).toBe(false);
    expect(await count(admin)).toBe(before - 1);
    // The HR officer is told about the same item and has not read it.
    expect((await item(hr, key.iqama))?.read).toBe(false);
    expect(await count(hr)).toBe(hrBefore);

    const marks = await marksOf(admin);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ itemKey: key.iqama, stage: 'escalation' });
    expect(marks[0]?.dueOn.toISOString().slice(0, 10)).toBe(day(5).toISOString().slice(0, 10));

    // Again: nothing new to mark, still one row.
    expect((await markRead([key.iqama]).expect(200)).body).toEqual({ marked: 1 });
    expect(await marksOf(admin)).toHaveLength(1);
    expect(await count(admin)).toBe(before - 1);
  });

  it('an item that climbs a stage is unread again — with its date unchanged', async () => {
    // This is the everyday case: nothing about the item changes, the days run
    // down and it crosses into the next stage. Reproduced here by moving the
    // threshold instead of the calendar: 20 days out is a Notice, until the
    // Reminder is set to start at 21.
    await markRead([key.passport]).expect(200);
    const read = await item(admin, key.passport);
    expect(read).toMatchObject({ stage: 'notice', read: true });
    const setThresholds = (value: unknown) =>
      http()
        .patch('/config/system/escalation.thresholds')
        .set('Cookie', admin.cookie)
        .send({ value });
    try {
      await setThresholds({
        ...DEFAULT_ESCALATION_THRESHOLDS,
        expiry: { notice: 30, reminder: 21, escalation: 7 },
      }).expect(200);
      const climbed = await item(admin, key.passport);
      expect(climbed).toMatchObject({ stage: 'reminder', dueOn: read?.dueOn, read: false });

      // Read at the new stage, it stays read — and there is still one row for it.
      await markRead([key.passport]).expect(200);
      expect((await item(admin, key.passport))?.read).toBe(true);
      expect((await marksOf(admin)).filter((m) => m.itemKey === key.passport)).toHaveLength(1);
    } finally {
      await setThresholds(DEFAULT_ESCALATION_THRESHOLDS).expect(200);
    }
    // Back at Notice, the mark made at Reminder does not cover it either.
    expect(await item(admin, key.passport)).toMatchObject({ stage: 'notice', read: false });
  });

  it('an item whose date changes is unread again, even at the same stage', async () => {
    await markRead([key.contract]).expect(200); // Reminder, 12 days
    expect((await item(admin, key.contract))?.read).toBe(true);
    await owner.employee.update({ where: { id: ids.a }, data: { contractEndDate: day(9) } }); // still Reminder
    expect(await item(admin, key.contract)).toMatchObject({ stage: 'reminder', read: false });
  });

  it('nobody marks what they are not shown: the key is ignored and nothing is stored', async () => {
    // The task is the GRO officer's; an HR officer does not see it (task scope).
    expect(await item(hr, key.task)).toBeUndefined();
    const res = await markRead([key.task, 'expiry:not-a-real-item', key.lapsed], hr).expect(200);
    expect(res.body).toEqual({ marked: 1 }); // only the one they are shown
    expect((await marksOf(hr)).map((m) => m.itemKey)).toEqual([key.lapsed]);
    // Its owner is unaffected.
    expect((await item(gro, key.task))?.read).toBe(false);
  });

  it('marks for items that have left the ladder are cleared the next time the person marks', async () => {
    await markRead([key.lapsed]).expect(200);
    expect((await marksOf(admin)).map((m) => m.itemKey)).toContain(key.lapsed);
    // Renewed: far outside every window — the item leaves the ladder.
    await owner.employee.update({ where: { id: ids.b }, data: { passportExpiry: day(900) } });
    expect(await item(admin, key.lapsed)).toBeUndefined();
    await markRead([key.iqama]).expect(200);
    expect((await marksOf(admin)).map((m) => m.itemKey)).not.toContain(key.lapsed);
    // It comes round again one day: unread, as if never seen.
    await owner.employee.update({ where: { id: ids.b }, data: { passportExpiry: day(-4) } });
    expect((await item(admin, key.lapsed))?.read).toBe(false);
  });

  it('refuses a body that is not a list of keys (400)', async () => {
    const before = await marksOf(admin);
    for (const body of [
      {},
      { keys: 'expiry:x' },
      { keys: [42] },
      { keys: [''] },
      { keys: Array.from({ length: 201 }, (_, i) => `k${i}`) },
      { keys: [key.iqama], all: true },
    ]) {
      const res = await http().post('/escalations/read').set('Cookie', admin.cookie).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(await marksOf(admin)).toEqual(before);
    expect((await markRead([]).expect(200)).body).toEqual({ marked: 0 });
  });

  it('who: staff only for now', async () => {
    for (const who of [rep, employee]) {
      await http().get('/escalations/count').set('Cookie', who.cookie).expect(403);
      await markRead([key.iqama], who).expect(403);
    }
    await http().get('/escalations/count').expect(401);
    await http()
      .post('/escalations/read')
      .send({ keys: [key.iqama] })
      .expect(401);
  });

  it('the database: the marks are closed to the client and employee connections', async () => {
    await expect(
      clientDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.client_id', ${ids.co}, true)`;
        return tx.escalationRead.findMany();
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      employeeDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.employee_id', ${ids.a}, true)`;
        return tx.escalationRead.findMany();
      }),
    ).rejects.toThrow(/permission denied/);
    // One row per person per item.
    const row = (await marksOf(admin))[0];
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO esc_reads (user_id, item_key, stage, due_on) VALUES ('${admin.userId}'::uuid, '${row?.itemKey}', 'notice', CURRENT_DATE)`,
      ),
    ).rejects.toThrow();
    await expect(
      owner.$executeRawUnsafe(
        `INSERT INTO esc_reads (user_id, item_key, stage, due_on) VALUES ('${admin.userId}'::uuid, '   ', 'notice', CURRENT_DATE)`,
      ),
    ).rejects.toThrow();
  });
});
