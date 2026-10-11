import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CalendarItem, EscalationLadderResponse } from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PolicyService } from '../src/modules/auth/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// MOB-06a (ADR-018 rev. 2): a READY step of a running onboarding or final exit is
// a work item. Each run has ONE owner — the client's named officer when it
// starts, changeable afterwards — and its ready steps appear in the calendar's
// data and in the notification ladder's queue rule, on their target date.
// Blocked and filed steps do not. Staff only.
const MARK = 'MOB-06-test';
const NOBODY = '33333333-3333-4333-8333-0000000000b6';
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
const iso = (offset: number): string => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function cleanup(owner: PrismaClient) {
  const clients = (
    await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
  ).map((c) => c.id);
  const where = { clientId: { in: clients } };
  const runs = (await owner.groSequence.findMany({ where, select: { id: true } })).map((r) => r.id);
  await owner.fee.deleteMany({ where });
  await owner.groSequenceStep.deleteMany({ where: { sequenceId: { in: runs } } });
  await owner.groSequence.deleteMany({ where: { id: { in: runs } } });
  await owner.employee.deleteMany({ where });
  await owner.client.deleteMany({ where: { id: { in: clients } } });
}

describe('Sequence steps as work items (MOB-06a, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let rep: TestPrincipal;
  const ids = { x: '', y: '', a: '', b: '', c: '', run: '' };

  const http = () => request(app.getHttpServer());
  const startRun = (who: TestPrincipal, employeeId: string, kind = 'onboarding') =>
    http().post(`/employees/${employeeId}/sequences`).set('Cookie', who.cookie).send({ kind });
  const assign = (who: TestPrincipal, id: string, assigneeUserId: string | null) =>
    http().post(`/gro-sequences/${id}/assign`).set('Cookie', who.cookie).send({ assigneeUserId });
  const steps = async (who: TestPrincipal, from: number, to: number): Promise<CalendarItem[]> =>
    (
      await http()
        .get('/calendar/view')
        .query({ from: `${iso(from)}T00:00:00Z`, to: `${iso(to)}T23:59:59Z` })
        .set('Cookie', who.cookie)
        .expect(200)
    ).body.items.filter((i: CalendarItem) => i.kind === 'step' && i.id === ids.run);
  const ladder = async (who: TestPrincipal): Promise<EscalationLadderResponse> =>
    (await http().get('/escalations').set('Cookie', who.cookie).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    await cleanup(owner);
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    // X names the GRO officer as its officer; Y names nobody.
    ids.x = (
      await owner.client.create({ data: { nameAr: 'شركة س', nameEn: `${MARK} X`, officerUserId: gro.userId } })
    ).id;
    ids.y = (await owner.client.create({ data: { nameAr: 'شركة ص', nameEn: `${MARK} Y` } })).id;
    const person = async (clientId: string, name: string) =>
      (
        await owner.employee.create({
          data: { clientId, nameAr: 'اختبار', nameEn: `${MARK} ${name}`, nationality: 'IN', contractType: 'unlimited' },
        })
      ).id;
    ids.a = await person(ids.x, 'a');
    ids.b = await person(ids.y, 'b');
    ids.c = await person(ids.x, 'c');
    rep = await loginAsClientRep(app, ids.x, 'client_manager');
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup(owner);
    await owner.$disconnect();
    await app.close();
  });

  describe('the owner of a run', () => {
    it('is the client’s named officer when the run starts; nobody where the client names none', async () => {
      const x = await startRun(hr, ids.a).expect(201);
      expect(x.body.assigneeUserId).toBe(gro.userId);
      ids.run = x.body.id;
      const y = await startRun(hr, ids.b).expect(201);
      expect(y.body.assigneeUserId).toBeNull();
    });

    it('an officer who can no longer work procedures is not made the owner', async () => {
      await owner.authUser.update({ where: { id: gro.userId }, data: { status: 'disabled' } });
      try {
        const res = await startRun(hr, ids.c, 'final_exit').expect(201);
        expect(res.body.assigneeUserId).toBeNull();
      } finally {
        await owner.authUser.update({ where: { id: gro.userId }, data: { status: 'active' } });
      }
    });

    it('can be handed to another officer, or cleared — audited, and only to someone who works procedures', async () => {
      const done = await assign(gro, ids.run, hr.userId).expect(200);
      expect(done.body.assigneeUserId).toBe(hr.userId);
      const entries = await owner.auditEntry.findMany({
        where: { resource: 'gro-sequence', resourceId: ids.a, action: 'assign' },
      });
      expect(entries).toHaveLength(1);
      // The person handed the run is told; nobody is told about their own act.
      const told = await owner.notification.count({
        where: { recipientUserId: hr.userId, data: { path: ['sequenceId'], equals: ids.run } },
      });
      expect(told).toBe(1);
      await assign(hr, ids.run, hr.userId).expect(200); // same owner again: nothing new
      expect(
        await owner.notification.count({
          where: { recipientUserId: hr.userId, data: { path: ['sequenceId'], equals: ids.run } },
        }),
      ).toBe(1);

      await assign(hr, ids.run, auditor.userId).expect(400); // reads everything, works nothing
      await assign(hr, ids.run, rep.userId).expect(400);
      await assign(hr, ids.run, NOBODY).expect(400);
      await assign(hr, ids.run, null).expect(200);
      await assign(hr, ids.run, gro.userId).expect(200);
    });

    it('is refused to the Auditor and to a client manager; an unknown run is not found', async () => {
      await assign(auditor, ids.run, hr.userId).expect(403);
      await assign(rep, ids.run, hr.userId).expect(403);
      await assign(hr, NOBODY, hr.userId).expect(404);
    });

    it('a finished run has no owner to change', async () => {
      const other = await owner.groSequence.findFirstOrThrow({ where: { employeeId: ids.b } });
      await http().post(`/gro-sequences/${other.id}/cancel`).set('Cookie', hr.cookie).expect(200);
      await assign(hr, other.id, hr.userId).expect(409);
    });
  });

  describe('in the calendar', () => {
    it('a READY step sits on its target date, owned by the run’s owner — a blocked one does not appear', async () => {
      // Started today: "block-visa" (day 0) is ready; "visa-auth" (day 7) waits on it.
      const today = await steps(hr, -1, 1);
      expect(today).toHaveLength(1);
      expect(today[0]).toMatchObject({
        kind: 'step',
        id: ids.run,
        title: 'block-visa',
        allDay: true,
        status: 'ready',
        clientId: ids.x,
        ownerUserId: gro.userId,
        step: { key: 'block-visa', sequenceKind: 'onboarding', employeeId: ids.a },
      });
      expect(today[0]!.startAt.slice(0, 10)).toBe(iso(0));
      expect(await steps(hr, 5, 9)).toEqual([]); // visa-auth's date: still blocked
    });

    it('filing a step takes it off and brings on the one it was blocking', async () => {
      await http().post(`/gro-sequences/${ids.run}/steps/block-visa/file`).set('Cookie', gro.cookie).send({}).expect(200);
      expect(await steps(hr, -1, 1)).toEqual([]);
      const next = await steps(hr, 5, 9);
      expect(next.map((i) => i.step?.key)).toEqual(['visa-auth']);
    });

    it('is only for those who read procedures', async () => {
      const policy = app.get(PolicyService);
      const real = policy.can.bind(policy);
      vi.spyOn(policy, 'can').mockImplementation((role, p) => (p === 'gro.read' ? false : real(role, p)));
      expect(await steps(hr, 5, 9)).toEqual([]);
      vi.restoreAllMocks();
      expect(await steps(hr, 5, 9)).toHaveLength(1);
    });
  });

  describe('in the notification ladder', () => {
    const key = () => `step:${ids.run}:visa-auth`;

    it('a ready step follows the queue rule on its target date, owned by the run’s owner', async () => {
      // visa-auth is ready and due in 7 days: outside the queue window (5).
      expect((await ladder(hr)).items.some((i) => i.key === key())).toBe(false);
      // Move the run's start back: the same step is now 3 days PAST its target.
      await owner.groSequence.update({
        where: { id: ids.run },
        data: { startedOn: new Date(`${iso(-10)}T00:00:00Z`) },
      });
      const item = (await ladder(hr)).items.find((i) => i.key === key());
      expect(item).toMatchObject({
        rule: 'queue',
        stage: 'breach',
        daysLeft: -3,
        dueOn: iso(-3),
        subject: { kind: 'sequence_step', sequenceId: ids.run, sequenceKind: 'onboarding', step: 'visa-auth', employee: { id: ids.a } },
        owner: { kind: 'person' },
        mine: false,
      });
      // It is the owner's: "mine" for the GRO officer.
      expect((await ladder(gro)).items.find((i) => i.key === key())).toMatchObject({ mine: true });
      // The step it blocks is not there, however late its own date is.
      expect((await ladder(hr)).items.some((i) => i.key === `step:${ids.run}:gamca`)).toBe(false);
    });

    it('a client manager is never shown a step', async () => {
      const theirs = await ladder(rep);
      expect(theirs.items.some((i) => i.subject.kind === 'sequence_step')).toBe(false);
    });

    it('cancelling the run takes its steps out', async () => {
      await http().post(`/gro-sequences/${ids.run}/cancel`).set('Cookie', hr.cookie).expect(200);
      expect((await ladder(hr)).items.some((i) => i.key === key())).toBe(false);
      expect(await steps(hr, -5, 9)).toEqual([]);
    });
  });
});

// Client managers hold gro.read, and no client role holds gro.process — so the
// permission alone keeps them off the assign route today. Granting it proves the
// staff check is a second lock (the MOB-02 pattern).
describe('Sequence owner — staff only, even for a widened client role (MOB-06a)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let rep: TestPrincipal;
  let runId = '';

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'client_manager' && permission === 'gro.process') return true;
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
    owner = db();
    const clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} widened` } })).id;
    const employeeId = (
      await owner.employee.create({
        data: { clientId, nameAr: 'اختبار', nameEn: `${MARK} widened`, nationality: 'IN', contractType: 'unlimited' },
      })
    ).id;
    runId = (
      await owner.groSequence.create({
        data: { clientId, employeeId, kind: 'onboarding', startedOn: new Date(`${iso(0)}T00:00:00Z`) },
      })
    ).id;
    rep = await loginAsClientRep(app, clientId, 'client_manager');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup(owner);
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted gro.process still cannot set a run’s owner', async () => {
    await request(app.getHttpServer())
      .post(`/gro-sequences/${runId}/assign`)
      .set('Cookie', rep.cookie)
      .send({ assigneeUserId: rep.userId })
      .expect(403);
  });
});
