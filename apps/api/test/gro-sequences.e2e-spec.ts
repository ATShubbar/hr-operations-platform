import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { requestContext, type RequestContext } from '../src/context/request-context';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  SEQUENCES,
  SEQUENCE_KINDS,
  SequencesService,
  filedDependents,
  integrityProblems,
  isComplete,
  stepsOf,
} from '../src/modules/gro/public-api';

// MOB-01 (ADR-018): onboarding and final-exit sequences — the pure step engine,
// the step lists' own integrity, and the audited service with its database fences.
const MARK = 'MOB-01-test';
const STAFF_USER = '00000000-0000-4000-8000-0000000000e1';

describe('Sequence engine (MOB-01, pure)', () => {
  it("the two step lists are the prototype's and are sound (earlier-only needs, no cycles, targets never run backwards)", () => {
    expect(SEQUENCES.onboarding.steps).toHaveLength(11);
    expect(SEQUENCES.final_exit.steps).toHaveLength(8);
    expect(SEQUENCES.onboarding.steps.map((s) => s.key)[0]).toBe('block-visa');
    expect(SEQUENCES.final_exit.steps.at(-1)!.key).toBe('depart');
    for (const k of SEQUENCE_KINDS) expect(integrityProblems(k), k).toEqual([]);
  });

  it('states: the first step is ready, the rest blocked with what they wait on; targets are start + day', () => {
    const steps = stepsOf('onboarding', '2026-10-01', {});
    expect(steps[0]).toMatchObject({ key: 'block-visa', state: 'ready', target: '2026-10-01' });
    expect(steps[1]).toMatchObject({
      key: 'visa-auth',
      state: 'blocked',
      waitingOn: ['Block visa requested'],
      target: '2026-10-08',
    });
    expect(steps.at(-1)).toMatchObject({ key: 'bank', state: 'blocked', target: '2026-11-20' });
  });

  it('a step with two needs is ready only when BOTH are filed', () => {
    const upToSettlement = {
      notice: '2026-10-01',
      clearance: '2026-10-02',
      settlement: '2026-10-03',
    };
    const a = stepsOf('final_exit', '2026-10-01', {
      ...upToSettlement,
      'gosi-close': '2026-10-04',
    });
    expect(a.find((s) => s.key === 'exit-visa')).toMatchObject({
      state: 'blocked',
      waitingOn: ['Contract closed on Qiwa'],
    });
    const b = stepsOf('final_exit', '2026-10-01', {
      ...upToSettlement,
      'gosi-close': '2026-10-04',
      'contract-close': '2026-10-04',
    });
    expect(b.find((s) => s.key === 'exit-visa')!.state).toBe('ready');
  });

  it('reopen is blocked by a FILED dependent only; complete means every step filed', () => {
    const filed = { notice: '2026-10-01', clearance: '2026-10-02' };
    expect(filedDependents('final_exit', 'notice', filed)).toEqual([
      'Company clearance and handover',
    ]);
    expect(filedDependents('final_exit', 'clearance', filed)).toEqual([]);
    expect(isComplete('final_exit', filed)).toBe(false);
    const all = Object.fromEntries(SEQUENCES.final_exit.steps.map((s) => [s.key, '2026-10-05']));
    expect(isComplete('final_exit', all)).toBe(true);
  });
});

describe('Sequences service (MOB-01, e2e)', () => {
  let app: INestApplication;
  let seq: SequencesService;
  let owner: PrismaClient;
  let staffDb: PrismaClient;
  let clientDb: PrismaClient;
  let co = '';
  const ids = { a: '', b: '', leaver: '' };

  const asStaff = <T>(fn: () => Promise<T>) =>
    requestContext.run(
      {
        requestId: 'mob-01',
        actorId: STAFF_USER,
        principalType: 'staff',
        role: 'gro_officer',
        clientId: null,
        employeeId: null,
      } as unknown as RequestContext,
      fn,
    );
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    seq = app.get(SequencesService);
    const db = (url?: string) =>
      new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
    owner = db(process.env.DATABASE_URL);
    staffDb = db(process.env.STAFF_DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    await cleanup();
    co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    const mk = async (name: string, employmentStatus: 'active' | 'terminated' = 'active') =>
      (
        await owner.employee.create({
          data: {
            clientId: co,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality: 'IN',
            contractType: 'unlimited',
            employmentStatus,
          },
        })
      ).id;
    ids.a = await mk('a');
    ids.b = await mk('b');
    ids.leaver = await mk('leaver', 'terminated');
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
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanup();
    await Promise.all([owner, staffDb, clientDb].map((c) => c.$disconnect()));
    await app.close();
  });

  it('start creates every step row and audits it against the employee; a second running one of the same kind is 409', async () => {
    const run = await asStaff(() => seq.start(ids.a, 'final_exit'));
    expect(run).toMatchObject({
      employeeId: ids.a,
      clientId: co,
      kind: 'final_exit',
      status: 'running',
      startedOn: today(),
    });
    expect(run.steps).toHaveLength(8);
    expect(run.steps[0]).toMatchObject({ key: 'notice', state: 'ready' });
    expect(await owner.groSequenceStep.count({ where: { sequenceId: run.id } })).toBe(8);
    const audit = await owner.auditEntry.findFirstOrThrow({
      where: { resource: 'gro-sequence', resourceId: ids.a, action: 'start' },
    });
    expect(audit).toMatchObject({ clientId: co, actorId: STAFF_USER });
    expect(audit.after).toMatchObject({ sequenceId: run.id, kind: 'final_exit' });
    await expect(asStaff(() => seq.start(ids.a, 'final_exit'))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('a terminated or unknown employee cannot start one; a final exit is refused while onboarding runs', async () => {
    await expect(asStaff(() => seq.start(ids.leaver, 'onboarding'))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      asStaff(() => seq.start('33333333-3333-4333-8333-0000000000e2', 'onboarding')),
    ).rejects.toMatchObject({ status: 404 });
    await asStaff(() => seq.start(ids.b, 'onboarding'));
    await expect(asStaff(() => seq.start(ids.b, 'final_exit'))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('files only READY steps, in order; a blocked step is 409 naming what it waits on; no future dates', async () => {
    const run = (await seq.listForEmployee(ids.a)).find(
      (r) => r.kind === 'final_exit' && r.status === 'running',
    )!;
    await expect(asStaff(() => seq.file(run.id, 'settlement'))).rejects.toMatchObject({
      status: 409,
    });
    await expect(asStaff(() => seq.file(run.id, 'settlement'))).rejects.toThrow(
      /Company clearance and handover/,
    );
    await expect(asStaff(() => seq.file(run.id, 'no-such-step'))).rejects.toMatchObject({
      status: 400,
    });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(asStaff(() => seq.file(run.id, 'notice', tomorrow))).rejects.toMatchObject({
      status: 400,
    });

    const after = await asStaff(() => seq.file(run.id, 'notice', daysAgo(3)));
    expect(after.steps.find((s) => s.key === 'notice')).toMatchObject({
      state: 'filed',
      filedOn: daysAgo(3),
    });
    expect(after.steps.find((s) => s.key === 'clearance')!.state).toBe('ready');
    // Filing it again is not a second filing.
    await expect(asStaff(() => seq.file(run.id, 'notice'))).rejects.toMatchObject({ status: 409 });
    expect(
      await owner.auditEntry.count({
        where: { resource: 'gro-sequence', resourceId: ids.a, action: 'file-step' },
      }),
    ).toBe(1);
  });

  it('reopen is refused while a filed step depends on it (409 naming it); reopening the later one first works', async () => {
    const run = (await seq.listForEmployee(ids.a)).find(
      (r) => r.kind === 'final_exit' && r.status === 'running',
    )!;
    await asStaff(() => seq.file(run.id, 'clearance'));
    await expect(asStaff(() => seq.reopen(run.id, 'notice'))).rejects.toThrow(
      /Company clearance and handover/,
    );
    await asStaff(() => seq.reopen(run.id, 'clearance'));
    const back = await asStaff(() => seq.reopen(run.id, 'notice'));
    expect(back.steps.find((s) => s.key === 'notice')).toMatchObject({
      state: 'ready',
      filedOn: null,
    });
    const row = await owner.groSequenceStep.findFirstOrThrow({
      where: { sequenceId: run.id, stepKey: 'notice' },
    });
    expect(row).toMatchObject({ filedOn: null, filedByUserId: null }); // the row stays; reopened, not deleted
    await expect(asStaff(() => seq.reopen(run.id, 'notice'))).rejects.toMatchObject({
      status: 409,
    }); // not filed
  });

  it('filing the last step completes the run (audited); a completed final exit cannot be reopened', async () => {
    const run = (await seq.listForEmployee(ids.a)).find(
      (r) => r.kind === 'final_exit' && r.status === 'running',
    )!;
    for (const s of SEQUENCES.final_exit.steps) await asStaff(() => seq.file(run.id, s.key));
    const done = await seq.get(run.id);
    expect(done).toMatchObject({ status: 'completed' });
    expect(done!.completedAt).not.toBeNull();
    expect(
      await owner.auditEntry.count({
        where: { resource: 'gro-sequence', resourceId: ids.a, action: 'complete' },
      }),
    ).toBe(1);
    await expect(asStaff(() => seq.reopen(run.id, 'depart'))).rejects.toMatchObject({
      status: 409,
    });
    await expect(asStaff(() => seq.file(run.id, 'depart'))).rejects.toMatchObject({ status: 409 });
    // A finished run frees the slot: another final exit may start.
    await asStaff(() => seq.start(ids.a, 'final_exit'));
  });

  // MOB-04b (owner decision): a completed onboarding is FINAL too. MOB-01 had
  // followed the prototype and let it reopen; its completion now makes the person
  // active and their candidate hired, which a reopen would not undo.
  it('a completed ONBOARDING is final as well: it cannot be reopened, and frees the slot', async () => {
    const run = (await seq.listForEmployee(ids.b)).find(
      (r) => r.kind === 'onboarding' && r.status === 'running',
    )!;
    for (const s of SEQUENCES.onboarding.steps) await asStaff(() => seq.file(run.id, s.key));
    expect((await seq.get(run.id))!.status).toBe('completed');
    await expect(asStaff(() => seq.reopen(run.id, 'bank'))).rejects.toMatchObject({ status: 409 });
    expect((await seq.get(run.id))!.status).toBe('completed');
    expect(
      await owner.auditEntry.count({
        where: { resource: 'gro-sequence', resourceId: ids.b, action: 'reopen-step' },
      }),
    ).toBe(0);
    await asStaff(() => seq.start(ids.b, 'onboarding'));
  });

  it('cancel ends a running run (audited) and frees the slot; a finished run cannot be cancelled', async () => {
    const run = (await seq.listForEmployee(ids.b)).find(
      (r) => r.kind === 'onboarding' && r.status === 'running',
    )!;
    const cancelled = await asStaff(() => seq.cancel(run.id));
    expect(cancelled).toMatchObject({ status: 'cancelled' });
    await expect(asStaff(() => seq.cancel(run.id))).rejects.toMatchObject({ status: 409 });
    await expect(asStaff(() => seq.file(run.id, 'block-visa'))).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await owner.auditEntry.count({
        where: { resource: 'gro-sequence', resourceId: ids.b, action: 'cancel' },
      }),
    ).toBe(1);
    await asStaff(() => seq.start(ids.b, 'onboarding'));
  });

  describe('the database fences', () => {
    it('one RUNNING sequence per employee per kind is a database rule, not only a service check', async () => {
      const run = (await seq.listForEmployee(ids.b)).find(
        (r) => r.kind === 'onboarding' && r.status === 'running',
      )!;
      await expect(
        staffDb.groSequence.create({
          data: { employeeId: ids.b, clientId: co, kind: 'onboarding', startedOn: new Date() },
        }),
      ).rejects.toThrow();
      expect(run).toBeTruthy();
    });

    it('client managers have no access to either table', async () => {
      const scoped = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
        clientDb.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.client_id', ${co}, true)`;
          return fn(tx as unknown as PrismaClient);
        });
      await expect(scoped((tx) => tx.groSequence.findMany())).rejects.toThrow(/permission denied/);
      await expect(scoped((tx) => tx.groSequenceStep.findMany())).rejects.toThrow(
        /permission denied/,
      );
    });

    it('nobody deletes a run or a step — not even the staff connection', async () => {
      const run = (await seq.listForEmployee(ids.b))[0]!;
      await expect(
        staffDb.groSequenceStep.deleteMany({ where: { sequenceId: run.id } }),
      ).rejects.toThrow(/permission denied/);
      await expect(staffDb.groSequence.delete({ where: { id: run.id } })).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
