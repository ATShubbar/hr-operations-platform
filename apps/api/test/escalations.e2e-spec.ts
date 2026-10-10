import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_ESCALATION_THRESHOLDS, type EscalationItem } from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PolicyService } from '../src/modules/auth/public-api';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// NC-01 (ADR-021): `GET /escalations` — the ladder for the signed-in staff
// member, from the real register. The rules themselves are proven without a
// database in `escalation-ladder.e2e-spec.ts`; this spec proves the WIRING:
// the right rows are read, each role is shown its own view, the thresholds
// setting drives the result, and nobody outside staff gets in.
const MARK = 'NC-01-test';
const KEY = 'escalation.thresholds';
const db = (url?: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
// Days are counted from today where the business is, as the service does.
const day = (offset: number): Date => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

describe('The escalation ladder for staff (NC-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let officer: TestPrincipal; // the GRO officer NAMED on company X
  let gro2: TestPrincipal; // another GRO officer
  let auditor: TestPrincipal;
  let rep: TestPrincipal;
  let employee: TestPrincipal;
  const ids = {
    x: '',
    y: '',
    a: '',
    saudi: '',
    c: '',
    dep: '',
    proc: '',
    taskHr: '',
    taskOther: '',
    req: '',
  };

  const http = () => request(app.getHttpServer());
  const ladder = (who: TestPrincipal) => http().get('/escalations').set('Cookie', who.cookie);
  // The suite's database also holds the seed's obligations: look only at ours.
  const mine = async (who: TestPrincipal): Promise<EscalationItem[]> => {
    const res = await ladder(who).expect(200);
    return (res.body.items as EscalationItem[]).filter(
      (i) => i.client?.id === ids.x || i.client?.id === ids.y,
    );
  };
  const find = (items: EscalationItem[], key: string) => items.find((i) => i.key === key);
  const setThresholds = (value: unknown, who: TestPrincipal = admin) =>
    http().patch(`/config/system/${KEY}`).set('Cookie', who.cookie).send({ value });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    await cleanup();

    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    officer = await loginAsStaff(app, 'gro_officer');
    gro2 = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    await owner.authUser.update({
      where: { id: officer.userId },
      data: { displayName: 'Turki Test' },
    });

    // X names an officer; Y names nobody.
    ids.x = (
      await owner.client.create({
        data: { nameAr: 'شركة س', nameEn: `${MARK} X`, officerUserId: officer.userId },
      })
    ).id;
    ids.y = (await owner.client.create({ data: { nameAr: 'شركة ص', nameEn: `${MARK} Y` } })).id;
    const person = (clientId: string, name: string, over: object = {}) =>
      owner.employee.create({
        data: {
          clientId,
          nameAr: 'اختبار',
          nameEn: `${MARK} ${name}`,
          nationality: 'IN',
          contractType: 'unlimited',
          ...over,
        },
      });
    ids.a = (
      await person(ids.x, 'a', {
        iqamaExpiry: day(5), // escalated
        passportExpiry: day(20), // notice
        contractEndDate: day(-2), // lapsed
        workPermitExpiry: day(200), // outside every window
      })
    ).id;
    ids.saudi = (
      await person(ids.x, 'saudi', {
        nationality: 'SA',
        iqamaExpiry: day(-1),
        passportExpiry: day(10),
      })
    ).id;
    ids.c = (await person(ids.y, 'c', { iqamaExpiry: day(10) })).id; // reminder
    ids.dep = (
      await owner.dependant.create({
        data: {
          employeeId: ids.a,
          relationship: 'spouse',
          nameEn: `${MARK} spouse`,
          iqamaExpiry: day(-1),
        },
      })
    ).id;
    ids.proc = (
      await owner.groProcess.create({
        data: {
          clientId: ids.x,
          employeeId: ids.a,
          type: 'exit_reentry',
          status: 'in_progress',
          dueDate: day(1),
          assigneeUserId: officer.userId,
        },
      })
    ).id;
    ids.taskHr = (
      await owner.task.create({
        data: {
          clientId: ids.x,
          title: `${MARK} hr task`,
          dueDate: day(-1),
          createdByUserId: hr.userId,
          assigneeUserId: hr.userId,
        },
      })
    ).id;
    ids.taskOther = (
      await owner.task.create({
        data: {
          clientId: ids.x,
          title: `${MARK} someone else's task`,
          dueDate: day(-1),
          createdByUserId: admin.userId,
          assigneeUserId: gro2.userId,
        },
      })
    ).id;
    ids.req = (
      await owner.request.create({
        data: {
          clientId: ids.x,
          type: 'letter',
          title: `${MARK} salary letter`,
          dueDate: day(2),
          createdByUserId: hr.userId,
        },
      })
    ).id;
    rep = await loginAsClientRep(app, ids.x, 'client_manager');
    employee = await loginAsEmployee(app, ids.a);
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    const people = (
      await owner.employee.findMany({ where: { clientId: { in: cos } }, select: { id: true } })
    ).map((e) => e.id);
    await owner.dependant.deleteMany({ where: { employeeId: { in: people } } });
    await owner.groProcess.deleteMany({ where: { clientId: { in: cos } } });
    await owner.task.deleteMany({ where: { clientId: { in: cos } } });
    await owner.request.deleteMany({ where: { clientId: { in: cos } } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { id: { in: people } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    // The thresholds are a SYSTEM setting: leave them as the rest of the suite expects.
    await setThresholds(DEFAULT_ESCALATION_THRESHOLDS);
    await cleanupHelperUsers(app);
    await cleanup();
    await owner.$disconnect();
    await app.close();
  });

  it('answers with the thresholds in force, the day it was worked out for, and whitelisted items', async () => {
    const res = await ladder(admin).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['items', 'suppressed', 'thresholds', 'today']);
    expect(res.body.today).toBe(iso(0));
    expect(res.body.thresholds).toEqual(DEFAULT_ESCALATION_THRESHOLDS);
    const item = find(res.body.items, `expiry:${ids.a}:iqama`);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'client',
      'daysLeft',
      'dueOn',
      'key',
      'mine',
      'owner',
      'rule',
      'stage',
      'subject',
      'told',
    ]);
    // An owner is a NAME or a role — never an account id or an email.
    expect(item?.owner).toEqual({ kind: 'person', name: 'Turki Test' });
    expect(JSON.stringify(res.body)).not.toContain(officer.email);
  });

  it('reads the register: each obligation at its highest stage, most urgent first', async () => {
    const items = await mine(admin);
    // Most urgent first. Two items at the same stage with the same days left are
    // ordered by their key, which here contains generated ids — so only ties are
    // settled by sorting; the order of stages and days is the one written here.
    const expected: Array<[string, string, number]> = [
      [`expiry:${ids.a}:contract`, 'breach', -2],
      [`dependant:${ids.dep}:iqama`, 'breach', -1],
      [`task:${ids.taskHr}`, 'breach', -1],
      [`task:${ids.taskOther}`, 'breach', -1],
      [`procedure:${ids.proc}`, 'escalation', 1],
      [`expiry:${ids.a}:iqama`, 'escalation', 5],
      [`request:${ids.req}`, 'reminder', 2],
      [`expiry:${ids.c}:iqama`, 'reminder', 10],
      [`expiry:${ids.saudi}:passport`, 'reminder', 10],
      [`expiry:${ids.a}:passport`, 'notice', 20],
    ];
    const rank = ['breach', 'escalation', 'reminder', 'notice'];
    const urgency = (a: [string, string, number], b: [string, string, number]) =>
      rank.indexOf(a[1]) - rank.indexOf(b[1]) || a[2] - b[2] || a[0].localeCompare(b[0]);
    // Written above already in order of stage and days: sorting must only settle ties.
    expect([...expected].sort(urgency).map((e) => [e[1], e[2]])).toEqual(
      expected.map((e) => [e[1], e[2]]),
    );
    expect(items.map((i) => [i.key, i.stage, i.daysLeft])).toEqual([...expected].sort(urgency));
    // Not there: a permit 200 days out, and a Saudi's "iqama" (they have none).
    const keys = items.map((i) => i.key);
    expect(keys).not.toContain(`expiry:${ids.a}:work_permit`);
    expect(keys).not.toContain(`expiry:${ids.saudi}:iqama`);
    expect(find(items, `expiry:${ids.a}:contract`)).toMatchObject({
      rule: 'expiry',
      dueOn: iso(-2),
      subject: { kind: 'document', doc: 'contract', employee: { id: ids.a } },
      client: { id: ids.x, name: { en: `${MARK} X`, ar: 'شركة س' } },
    });
  });

  it("the named officer owns their company's expiries; a company with none falls to the role", async () => {
    const asOfficer = await mine(officer);
    // Everything at X that is an expiry is the named officer's — the contract too.
    for (const key of [
      `expiry:${ids.a}:iqama`,
      `expiry:${ids.a}:passport`,
      `expiry:${ids.a}:contract`,
      `dependant:${ids.dep}:iqama`,
    ]) {
      expect(find(asOfficer, key), key).toMatchObject({ mine: true, told: true });
    }
    // Y names nobody: its iqama belongs to the GRO officers as a role.
    expect(find(asOfficer, `expiry:${ids.c}:iqama`)).toMatchObject({
      owner: { kind: 'role', role: 'gro_officer' },
      mine: true,
    });

    // Another GRO officer reads X's expiries but is not told: they are not theirs.
    const asOther = await mine(gro2);
    expect(find(asOther, `expiry:${ids.a}:iqama`)).toMatchObject({ mine: false, told: false });
    expect(find(asOther, `expiry:${ids.a}:contract`)).toMatchObject({ mine: false, told: false });
    expect(find(asOther, `expiry:${ids.c}:iqama`)).toMatchObject({ mine: true, told: true });
  });

  it('each role is told what its stage reaches — and the Auditor nothing', async () => {
    const told = (items: EscalationItem[]) =>
      items
        .filter((i) => i.told)
        .map((i) => i.key)
        .sort();
    const sorted = (keys: string[]) => [...keys].sort();
    // HR officers: Reminder and above, everywhere; plus their own task.
    expect(told(await mine(hr))).toEqual(
      sorted([
        `expiry:${ids.a}:contract`,
        `dependant:${ids.dep}:iqama`,
        `task:${ids.taskHr}`,
        `procedure:${ids.proc}`,
        `expiry:${ids.a}:iqama`,
        `request:${ids.req}`,
        `expiry:${ids.c}:iqama`,
        `expiry:${ids.saudi}:passport`,
      ]),
    );
    // Administrators: Escalated and Breach only.
    expect(told(await mine(admin))).toEqual(
      sorted([
        `expiry:${ids.a}:contract`,
        `dependant:${ids.dep}:iqama`,
        `task:${ids.taskHr}`,
        `task:${ids.taskOther}`,
        `procedure:${ids.proc}`,
        `expiry:${ids.a}:iqama`,
      ]),
    );
    // The Auditor reads every one of them and is told none.
    const asAuditor = await mine(auditor);
    expect(asAuditor).toHaveLength(10);
    expect(asAuditor.every((i) => !i.told && !i.mine)).toBe(true);
  });

  it("a task follows the reader's task scope: an HR officer never sees someone else's", async () => {
    const asHr = (await mine(hr)).map((i) => i.key);
    expect(asHr).toContain(`task:${ids.taskHr}`);
    expect(asHr).not.toContain(`task:${ids.taskOther}`);
    // Its assignee sees it and owns it; the Administrator sees both.
    expect(find(await mine(gro2), `task:${ids.taskOther}`)).toMatchObject({
      mine: true,
      told: true,
    });
    expect(find(await mine(officer), `task:${ids.taskOther}`)).toBeUndefined();
  });

  it('an expiry goes quiet while its renewal is open, and the answer says how many are quiet', async () => {
    const before = (await ladder(admin).expect(200)).body.suppressed as number;
    const renewal = await owner.groProcess.create({
      data: { clientId: ids.y, employeeId: ids.c, type: 'iqama_renewal', status: 'submitted' },
    });
    const res = await ladder(admin).expect(200);
    expect(res.body.suppressed).toBe(before + 1);
    expect(find(res.body.items, `expiry:${ids.c}:iqama`)).toBeUndefined();

    // Finished: the expiry speaks again.
    await owner.groProcess.update({ where: { id: renewal.id }, data: { status: 'completed' } });
    const after = await ladder(admin).expect(200);
    expect(after.body.suppressed).toBe(before);
    expect(find(after.body.items, `expiry:${ids.c}:iqama`)).toBeDefined();
    await owner.groProcess.delete({ where: { id: renewal.id } });
  });

  it('an officer who is no longer active stops owning: the role takes over', async () => {
    await owner.authUser.update({ where: { id: officer.userId }, data: { status: 'disabled' } });
    try {
      const asOther = await mine(gro2);
      expect(find(asOther, `expiry:${ids.a}:iqama`)).toMatchObject({
        owner: { kind: 'role', role: 'gro_officer' },
        mine: true,
        told: true,
      });
      // The contract goes to the HR officers, as it would with no officer named.
      expect(find(await mine(hr), `expiry:${ids.a}:contract`)).toMatchObject({
        owner: { kind: 'role', role: 'hr_officer' },
        mine: true,
      });
    } finally {
      await owner.authUser.update({ where: { id: officer.userId }, data: { status: 'active' } });
    }
  });

  it('the thresholds are a setting: change one and the ladder changes; only the Administrator may', async () => {
    const stageOf = async () => find(await mine(admin), `expiry:${ids.a}:passport`)?.stage;
    expect(await stageOf()).toBe('notice'); // 20 days, Reminder at 14

    const wider = {
      ...DEFAULT_ESCALATION_THRESHOLDS,
      expiry: { notice: 60, reminder: 21, escalation: 7 },
    };
    await setThresholds(wider).expect(200);
    const res = await ladder(admin).expect(200);
    expect(res.body.thresholds).toEqual(wider);
    expect(await stageOf()).toBe('reminder');
    const entry = await owner.auditEntry.findFirst({
      where: { resource: 'config', actorId: admin.userId },
      orderBy: { id: 'desc' },
    });
    expect(JSON.stringify(entry?.after)).toContain('"notice":60');

    // Refused, and nothing changes.
    const bad: unknown[] = [
      { ...DEFAULT_ESCALATION_THRESHOLDS, expiry: { notice: 14, reminder: 30, escalation: 7 } }, // out of order
      { ...DEFAULT_ESCALATION_THRESHOLDS, queue: { notice: 4, reminder: 2, escalation: 1 } }, // 4 is not on the list
      { ...DEFAULT_ESCALATION_THRESHOLDS, sla: { notice: 5, reminder: 2, escalation: 1 } }, // a request has no Notice
      { expiry: DEFAULT_ESCALATION_THRESHOLDS.expiry },
      'thirty days',
    ];
    for (const value of bad) {
      const refused = await setThresholds(value);
      expect(refused.status, JSON.stringify(value)).toBe(400);
    }
    for (const who of [hr, officer, auditor]) await setThresholds(wider, who).expect(403);
    expect((await ladder(admin).expect(200)).body.thresholds).toEqual(wider);

    await setThresholds(DEFAULT_ESCALATION_THRESHOLDS).expect(200);
    expect(await stageOf()).toBe('notice');
  });

  it('who: staff only — a client manager, an employee and a stranger are refused', async () => {
    await ladder(rep).expect(403);
    await ladder(employee).expect(403);
    await http().get('/escalations').expect(401);
  });
});

// The staff check, proven with a WIDENED policy. NC-05 gives client managers
// their own path; until then holding the permission must not be enough.
describe('The ladder — staff only, even for a role that held the permission (NC-01)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let rep: TestPrincipal;
  let clientId = '';

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'client_manager' && permission === 'escalation.read') return true;
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
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted escalation.read is still refused', async () => {
    await request(app.getHttpServer()).get('/escalations').set('Cookie', rep.cookie).expect(403);
  });
});
