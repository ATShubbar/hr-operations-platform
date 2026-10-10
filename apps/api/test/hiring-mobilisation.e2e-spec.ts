import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EmployeeJoinedEvent } from '../src/modules/employees/public-api';
import { SEQUENCES } from '../src/modules/gro/public-api';
import {
  CandidatesService,
  EMPLOYEE_JOINED,
  VacanciesService,
} from '../src/modules/recruitment/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// MOB-04b (ADR-018): the Hiring board's Visa & mobilisation column.
//   Offer → mobilisation   creates the employee as `onboarding` and starts onboarding
//   last onboarding step   makes them `active` (hire date = the arrival step's date)
//                          and moves the candidate to `hired` — ONE employee, ever
//   withdraw / reject      cancels the onboarding and terminates the record
// Saudi nationals skip it; nobody leaves mobilisation for `hired` or `offer` by hand;
// Offer → hired (the direct hire) is unchanged; a completed onboarding is final.
const MARK = 'MOB-04b-test';
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('Hiring → Visa & mobilisation (MOB-04b, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let candidates: CandidatesService;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let clientId = '';
  let vacancyId = '';

  const http = () => request(app.getHttpServer());
  const advance = (id: string, stage: string) =>
    http().post(`/candidates/${id}/stage`).set('Cookie', hr.cookie).send({ stage });
  // `null` = no nationality on file (a default parameter would swallow `undefined`).
  const atOffer = async (nameEn: string, nationality: string | null = 'IN') => {
    const c = await candidates.create({
      vacancyId,
      nameAr: 'مرشح',
      nameEn: `${MARK} ${nameEn}`,
      ...(nationality ? { nationality } : {}),
    });
    for (const s of ['screening', 'interview', 'offer']) await advance(c.id, s).expect(200);
    return c.id;
  };
  const runOf = async (employeeId: string) =>
    (await http().get(`/employees/${employeeId}/sequences`).set('Cookie', gro.cookie).expect(200))
      .body.sequences as Array<{
      id: string;
      kind: string;
      status: string;
    }>;
  const file = (runId: string, key: string, filedOn?: string) =>
    http()
      .post(`/gro-sequences/${runId}/steps/${key}/file`)
      .set('Cookie', gro.cookie)
      .send(filedOn ? { filedOn } : {});

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    candidates = app.get(CandidatesService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await cleanup();
    clientId = (
      await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X`, status: 'active' } })
    ).id;
    vacancyId = (
      await app
        .get(VacanciesService)
        .create({ clientId, titleAr: 'فني', titleEn: `${MARK} Technician` })
    ).id;
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
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
    await owner.candidate.deleteMany({ where: { clientId: { in: cos } } });
    await owner.vacancy.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { id: { in: emps } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanup();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('the whole chain: mobilise → employee `onboarding` + sequence → every step filed → `active`, hire date = arrival, candidate hired, ONE employee', async () => {
    const id = await atOffer('chain');
    const moved = await advance(id, 'mobilisation').expect(200);
    expect(moved.body.stage).toBe('mobilisation');
    const employeeId = moved.body.employeeId as string;
    expect(employeeId).toMatch(/^[0-9a-f-]{36}$/);

    const emp = await owner.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(emp).toMatchObject({
      clientId,
      nameEn: `${MARK} chain`,
      nationality: 'IN',
      employmentStatus: 'onboarding',
      hireDate: null,
    });
    const [run] = await runOf(employeeId);
    expect(run).toMatchObject({ kind: 'onboarding', status: 'running' });

    // File every step; the arrival ("travel") three days ago.
    for (const s of SEQUENCES.onboarding.steps) {
      await file(
        run!.id,
        s.key,
        s.key === 'travel' ? dayAgo(3) : s.day < 28 ? dayAgo(5) : undefined,
      ).expect(200);
    }
    expect((await runOf(employeeId))[0]!.status).toBe('completed');

    const after = await owner.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(after.employmentStatus).toBe('active');
    expect(after.hireDate?.toISOString().slice(0, 10)).toBe(dayAgo(3));
    expect((await owner.candidate.findUniqueOrThrow({ where: { id } })).stage).toBe('hired');
    // Exactly one employee — the completion's `hired` does not create a second.
    expect(await owner.employee.count({ where: { clientId, nameEn: `${MARK} chain` } })).toBe(1);
    // The candidate's move to hired was audited.
    expect(
      await owner.auditEntry.count({ where: { resource: 'candidate', action: 'stage', clientId } }),
    ).toBeGreaterThanOrEqual(5);

    // A completed onboarding is final (owner decision — MOB-01 had allowed it).
    await http()
      .post(`/gro-sequences/${run!.id}/steps/bank/reopen`)
      .set('Cookie', gro.cookie)
      .expect(409);
  });

  it('a hire date already on file is kept', async () => {
    const id = await atOffer('dated');
    const employeeId = (await advance(id, 'mobilisation').expect(200)).body.employeeId as string;
    await owner.employee.update({
      where: { id: employeeId },
      data: { hireDate: new Date('2026-01-15T00:00:00Z') },
    });
    const [run] = await runOf(employeeId);
    for (const s of SEQUENCES.onboarding.steps) await file(run!.id, s.key).expect(200);
    const after = await owner.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(after).toMatchObject({ employmentStatus: 'active' });
    expect(after.hireDate?.toISOString().slice(0, 10)).toBe('2026-01-15');
  });

  it('a Saudi national skips it: mobilisation is refused (400), the direct hire still works', async () => {
    const id = await atOffer('saudi', 'SA');
    await advance(id, 'mobilisation').expect(400);
    await advance(id, 'hired').expect(200);
    const made = await owner.employee.findMany({ where: { clientId, nameEn: `${MARK} saudi` } });
    expect(made).toHaveLength(1);
    expect(made[0]!.employmentStatus).toBe('active');
    expect(await owner.groSequence.count({ where: { employeeId: made[0]!.id } })).toBe(0);
  });

  it('a non-Saudi may be hired directly too (already in the Kingdom): no onboarding is started', async () => {
    const id = await atOffer('transfer');
    await advance(id, 'hired').expect(200);
    const made = await owner.employee.findMany({ where: { clientId, nameEn: `${MARK} transfer` } });
    expect(made).toHaveLength(1);
    expect(made[0]!.employmentStatus).toBe('active');
    expect(await owner.groSequence.count({ where: { employeeId: made[0]!.id } })).toBe(0);
  });

  it('no nationality on file → mobilisation refused (400), nothing created', async () => {
    const id = await atOffer('nonat', null);
    await advance(id, 'mobilisation').expect(400);
    expect(await owner.employee.count({ where: { clientId, nameEn: `${MARK} nonat` } })).toBe(0);
  });

  it('nobody leaves mobilisation by hand for hired or offer (400) — only the onboarding does', async () => {
    const id = await atOffer('stuck');
    const employeeId = (await advance(id, 'mobilisation').expect(200)).body.employeeId as string;
    await advance(id, 'hired').expect(400);
    await advance(id, 'offer').expect(400);
    await advance(id, 'mobilisation').expect(400);
    expect((await owner.candidate.findUniqueOrThrow({ where: { id } })).stage).toBe('mobilisation');
    expect(
      (await owner.employee.findUniqueOrThrow({ where: { id: employeeId } })).employmentStatus,
    ).toBe('onboarding');
  });

  it('withdrawing — or rejecting — during mobilisation cancels the onboarding and terminates the record', async () => {
    for (const [name, end] of [
      ['withdrawn-one', 'withdrawn'],
      ['rejected-one', 'rejected'],
    ] as const) {
      const id = await atOffer(name);
      const employeeId = (await advance(id, 'mobilisation').expect(200)).body.employeeId as string;
      const [run] = await runOf(employeeId);
      await file(run!.id, 'block-visa').expect(200);
      await advance(id, end).expect(200);
      expect(
        (await owner.employee.findUniqueOrThrow({ where: { id: employeeId } })).employmentStatus,
      ).toBe('terminated');
      expect((await owner.groSequence.findUniqueOrThrow({ where: { id: run!.id } })).status).toBe(
        'cancelled',
      );
      expect((await owner.candidate.findUniqueOrThrow({ where: { id } })).stage).toBe(end);
    }
  });

  it('an onboarding started BY HAND for someone already active changes neither their status nor any candidate', async () => {
    const emp = await owner.employee.create({
      data: {
        clientId,
        nameAr: 'يدوي',
        nameEn: `${MARK} by hand`,
        nationality: 'IN',
        contractType: 'unlimited',
        hireDate: new Date('2025-03-01T00:00:00Z'),
      },
    });
    const run = (
      await http()
        .post(`/employees/${emp.id}/sequences`)
        .set('Cookie', gro.cookie)
        .send({ kind: 'onboarding' })
        .expect(201)
    ).body.id as string;
    for (const s of SEQUENCES.onboarding.steps) await file(run, s.key).expect(200);
    const after = await owner.employee.findUniqueOrThrow({ where: { id: emp.id } });
    expect(after.employmentStatus).toBe('active');
    expect(after.hireDate?.toISOString().slice(0, 10)).toBe('2025-03-01');
  });

  it('the pipeline counts candidates in mobilisation', async () => {
    const res = await http()
      .get('/vacancies')
      .query({ clientId })
      .set('Cookie', hr.cookie)
      .expect(200);
    const v = (res.body.vacancies as Array<{ id: string; pipeline: Record<string, number> }>).find(
      (x) => x.id === vacancyId,
    )!;
    expect(v.pipeline.mobilisation).toBe(1); // "stuck" is still there
    expect(v.pipeline.hired).toBeGreaterThanOrEqual(4);
  });

  it("Recruitment listens for Employees' event BY NAME (it cannot import Employees) — the name is pinned here", () => {
    expect(EMPLOYEE_JOINED).toBe(EmployeeJoinedEvent.NAME);
    const e = new EmployeeJoinedEvent('00000000-0000-4000-8000-000000000001', clientId, null);
    expect(Object.keys(e).sort()).toEqual(['clientId', 'correlationId', 'employeeId', 'name']);
  });
});
