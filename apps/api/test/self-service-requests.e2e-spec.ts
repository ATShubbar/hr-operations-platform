import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
} from './helpers/login';

// SS-05 (ADR-011): POST /me/requests and GET /me/requests — the first thing an
// employee WRITES. Companies, employees and requests are created HERE so flag
// state and request lists cannot race other specs.

const MARK = 'SS-05-test';

describe('My requests — employee self-service (SS-05, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let empDb: PrismaClient; // raw app_employee connection — for the forged-insert tests
  const co = { on: '', off: '' };
  const emp = { me: '', colleague: '', outsider: '', terminated: '' };
  const req = { rep: '', colleague: '' };

  let meSession: Awaited<ReturnType<typeof loginAsEmployee>> | undefined;
  const mine = async () => (meSession ??= await loginAsEmployee(app, emp.me));
  let colleagueSession: Awaited<ReturnType<typeof loginAsEmployee>> | undefined;
  const colleagues = async () => (colleagueSession ??= await loginAsEmployee(app, emp.colleague));

  const http = () => request(app.getHttpServer());
  const raise = (cookie: string | undefined, body: unknown) => {
    const r = http()
      .post('/me/requests')
      .send(body as object);
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const listMine = (cookie?: string) => {
    const r = http().get('/me/requests');
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const title = () => `${MARK} ${randomUUID()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    empDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.EMPLOYEE_DATABASE_URL ?? '' }),
    });

    co.on = (await prisma.client.create({ data: { nameAr: 'مفعلة', nameEn: `${MARK} On` } })).id;
    co.off = (
      await prisma.client.create({ data: { nameAr: 'غير مفعلة', nameEn: `${MARK} Off` } })
    ).id;
    await prisma.clientSetting.create({
      data: { clientId: co.on, key: 'flag.employee-self-service', value: true },
    });
    const person = async (clientId: string, name: string, extra = {}) =>
      (
        await prisma.employee.create({
          data: {
            clientId,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality: 'EG',
            contractType: 'unlimited',
            ...extra,
          },
        })
      ).id;
    emp.me = await person(co.on, 'me');
    emp.colleague = await person(co.on, 'colleague');
    emp.outsider = await person(co.off, 'outsider');
    emp.terminated = await person(co.on, 'terminated', { employmentStatus: 'terminated' });

    // A request the client rep raised, and one a colleague raised — neither may
    // appear in MY list.
    req.rep = (
      await prisma.request.create({
        data: {
          clientId: co.on,
          type: 'general',
          title: `${MARK} rep-raised`,
          createdByUserId: randomUUID(),
        },
      })
    ).id;
    req.colleague = (
      await prisma.request.create({
        data: {
          clientId: co.on,
          type: 'letter',
          title: `${MARK} colleague-raised`,
          createdByUserId: randomUUID(),
          requesterEmployeeId: emp.colleague,
        },
      })
    ).id;
  });

  afterAll(async () => {
    const reqs = await prisma.request.findMany({
      where: { clientId: { in: [co.on, co.off] } },
      select: { id: true },
    });
    await prisma.task.deleteMany({ where: { requestId: { in: reqs.map((r) => r.id) } } });
    await prisma.request.deleteMany({ where: { clientId: { in: [co.on, co.off] } } });
    await prisma.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await prisma.clientSetting.deleteMany({ where: { clientId: { in: [co.on, co.off] } } });
    await prisma.client.deleteMany({ where: { id: { in: [co.on, co.off] } } });
    await cleanupHelperUsers(app);
    await empDb.$disconnect();
    await app.close();
  });

  // ---- Raising a request --------------------------------------------------

  it("raises a request; the row is mine, my company's, and untouched by me on every staff field", async () => {
    const me = await mine();
    const t = title();
    const res = await raise(me.cookie, {
      type: 'certificate',
      title: t,
      description: 'Salary certificate for the bank, please.',
    }).expect(201);
    expect(res.body).toMatchObject({
      type: 'certificate',
      title: t,
      status: 'open',
      description: 'Salary certificate for the bank, please.',
    });

    const row = await prisma.request.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({
      clientId: co.on,
      requesterEmployeeId: emp.me,
      createdByUserId: me.userId,
      status: 'open',
      priority: 'normal',
      assigneeUserId: null,
    });
    // THREAD-04: the due date is the SYSTEM's — the type's service level, set
    // after the raise commits on the staff connection (the employee still can't
    // choose one: employee_raise requires it empty), and audited as such.
    expect(row.dueDate).not.toBeNull();
    const set = await prisma.auditEntry.findFirst({
      where: { resource: 'request', resourceId: row.id, action: 'service-level-set' },
    });
    expect(set).not.toBeNull();
  });

  it('writes EXACTLY one audit entry, as the employee, for my company — and spawns ONE task', async () => {
    const me = await mine();
    const t = title();
    const id = (await raise(me.cookie, { type: 'general', title: t }).expect(201)).body
      .id as string;

    const audits = await prisma.$queryRaw<
      Array<{ actor_id: string; actor_role: string; client_id: string }>
    >`
      SELECT actor_id::text, actor_role, client_id::text FROM aud_entries
      WHERE resource = 'request' AND action = 'create' AND "after"->>'title' = ${t}`;
    expect(audits).toEqual([{ actor_id: me.userId, actor_role: 'employee', client_id: co.on }]);

    const tasks = await prisma.task.findMany({ where: { requestId: id } });
    expect(tasks).toHaveLength(1);
  });

  it('returns EXACTLY the agreed request fields', async () => {
    const res = await raise((await mine()).cookie, { type: 'general', title: title() }).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(
      ['createdAt', 'description', 'id', 'serviceLevelDays', 'status', 'title', 'type', 'updatedAt'].sort(),
    );
  });

  // ---- Who sees it --------------------------------------------------------

  it('my client rep and staff SEE it through their existing screens', async () => {
    const t = title();
    const id = (await raise((await mine()).cookie, { type: 'document', title: t }).expect(201)).body
      .id;
    const rep = await loginAsClientRep(app, co.on, 'client_manager');
    const staff = await loginAsStaff(app, 'hr_officer');
    const repIds = (
      await http().get('/requests').set('Cookie', rep.cookie).expect(200)
    ).body.requests.map((r: { id: string }) => r.id);
    const staffIds = (
      await http().get(`/requests?clientId=${co.on}`).set('Cookie', staff.cookie).expect(200)
    ).body.requests.map((r: { id: string }) => r.id);
    expect(repIds).toContain(id);
    expect(staffIds).toContain(id);
  });

  it("MY list holds only what I raised — not my rep's, not my colleague's; my colleague's list holds none of mine", async () => {
    const t = title();
    const mineId = (await raise((await mine()).cookie, { type: 'general', title: t }).expect(201))
      .body.id;
    const myIds = (await listMine((await mine()).cookie).expect(200)).body.requests.map(
      (r: { id: string }) => r.id,
    );
    expect(myIds).toContain(mineId);
    expect(myIds).not.toContain(req.rep);
    expect(myIds).not.toContain(req.colleague);

    const theirIds = (await listMine((await colleagues()).cookie).expect(200)).body.requests.map(
      (r: { id: string }) => r.id,
    );
    expect(theirIds).toEqual([req.colleague]);
  });

  // ---- What may not be written --------------------------------------------

  it.each([
    ['status', { status: 'closed' }],
    ['priority', { priority: 'urgent' }],
    ['clientId', { clientId: randomUUID() }],
    ['assigneeUserId', { assigneeUserId: randomUUID() }],
    ['dueDate', { dueDate: '2030-01-01' }],
    ['requesterEmployeeId', { requesterEmployeeId: randomUUID() }],
  ])('a body carrying %s is REJECTED (400), not silently applied', async (_k, extra) => {
    await raise((await mine()).cookie, { type: 'general', title: title(), ...extra }).expect(400);
  });

  it('an unknown type or an empty title → 400', async () => {
    const cookie = (await mine()).cookie;
    await raise(cookie, { type: 'leave', title: title() }).expect(400);
    await raise(cookie, { type: 'general', title: '   ' }).expect(400);
  });

  // ---- The database refuses a forged write, whatever the app does ---------

  describe('directly against the app_employee connection, scoped to ME', () => {
    const asMe = <T>(op: (tx: PrismaClient) => Promise<T>) =>
      empDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.employee_id', ${emp.me}, TRUE)`;
        return op(tx as unknown as PrismaClient);
      });
    const base = () => ({
      clientId: co.on,
      requesterEmployeeId: emp.me,
      type: 'general' as const,
      title: title(),
      createdByUserId: randomUUID(),
    });

    it('a well-formed own request is accepted', async () => {
      await expect(asMe((tx) => tx.request.create({ data: base() }))).resolves.toBeTruthy();
    });

    it.each([
      ['raised as a COLLEAGUE', { requesterEmployeeId: 'colleague' }],
      ['for ANOTHER company', { clientId: 'off' }],
      ['already closed', { status: 'closed' }],
      ['marked high priority', { priority: 'high' }],
      ['with a due date', { dueDate: new Date('2030-01-01') }],
      ['pre-assigned', { assigneeUserId: randomUUID() }],
    ])('a request %s is refused by RLS', async (_label, over) => {
      const data: Record<string, unknown> = { ...base(), ...over };
      if (data.requesterEmployeeId === 'colleague') data.requesterEmployeeId = emp.colleague;
      if (data.clientId === 'off') data.clientId = co.off;
      await expect(asMe((tx) => tx.request.create({ data: data as never }))).rejects.toThrow(
        /row-level security/i,
      );
    });

    it('updating or deleting a request — even my own — is refused', async () => {
      const own = await prisma.request.create({ data: base() });
      await expect(
        asMe((tx) => tx.request.update({ where: { id: own.id }, data: { title: 'changed' } })),
      ).rejects.toThrow(/permission denied/i);
      await expect(asMe((tx) => tx.request.delete({ where: { id: own.id } }))).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('an audit entry for ANOTHER company is refused, and the audit trail is not readable', async () => {
      await expect(
        asMe(
          (tx) =>
            tx.$executeRaw`INSERT INTO aud_entries (client_id, resource, action) VALUES (${co.off}::uuid, 'request', 'create')`,
        ),
      ).rejects.toThrow(/row-level security/i);
      await expect(asMe((tx) => tx.auditEntry.findMany())).rejects.toThrow(/permission denied/i);
    });
  });

  // ---- The gates every /me route has --------------------------------------

  it('company not opted in → 403 on both routes', async () => {
    const out = await loginAsEmployee(app, emp.outsider);
    await listMine(out.cookie).expect(403);
    await raise(out.cookie, { type: 'general', title: title() }).expect(403);
  });

  it('terminated → 403', async () => {
    const gone = await loginAsEmployee(app, emp.terminated);
    await raise(gone.cookie, { type: 'general', title: title() }).expect(403);
  });

  it('staff and client reps → 403 on /me/requests; unauthenticated → 401', async () => {
    const staff = await loginAsStaff(app, 'hr_officer');
    const rep = await loginAsClientRep(app, co.on, 'client_manager');
    await listMine(staff.cookie).expect(403);
    await raise(staff.cookie, { type: 'general', title: title() }).expect(403);
    await listMine(rep.cookie).expect(403);
    await raise(rep.cookie, { type: 'general', title: title() }).expect(403);
    await listMine().expect(401);
    await raise(undefined, { type: 'general', title: title() }).expect(401);
  });
});
