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

// ASSIGN-01 (REQ-05's rule, everywhere): a task or a GRO procedure is handed only
// to an ACTIVE STAFF account whose role can work it — task.update for tasks,
// gro.process for procedures. Not a client manager, an employee, the Auditor, a
// disabled account or an unknown id (400). Clearing the assignee stays allowed
// (unassigned work is normal). The person handed it is told — never when they
// take it themselves.
const MARK = 'ASSIGN-01-test';
const TASK_TITLE = 'A task was assigned to you';
const PROC_TITLE = 'A procedure was assigned to you';

describe('Assignee rules for tasks and procedures (ASSIGN-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let co = '';
  let empId = '';
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let disabled: TestPrincipal;
  let manager: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };
  let wrong: string[] = [];

  const http = () => request(app.getHttpServer());
  const told = (userId: string, titleEn: string) =>
    owner.notification.count({ where: { recipientUserId: userId, titleEn } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    await owner.clientSetting.create({ data: { clientId: co, key: 'flag.employee-self-service', value: true } });
    empId = (
      await owner.employee.create({
        data: { clientId: co, nameAr: 'موظف', nameEn: `${MARK} me`, nationality: 'EG', contractType: 'unlimited' },
      })
    ).id;
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    disabled = await loginAsStaff(app, 'gro_officer');
    await owner.authUser.update({ where: { id: disabled.userId }, data: { status: 'disabled' } });
    manager = await loginAsClientRep(app, co);
    me = await loginAsEmployee(app, empId);
    wrong = [manager.userId, me.userId, auditor.userId, disabled.userId, '33333333-3333-4333-8333-000000000097'];
  });

  afterAll(async () => {
    await owner.task.deleteMany({ where: { title: { startsWith: MARK } } });
    await owner.groProcess.deleteMany({ where: { clientId: co } });
    await owner.notification.deleteMany({
      where: { recipientUserId: { in: [hr.userId, gro.userId, auditor.userId, disabled.userId, manager.userId, me.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: co } });
    await owner.clientSetting.deleteMany({ where: { clientId: co } });
    await owner.client.deleteMany({ where: { id: co } });
    await owner.$disconnect();
    await app.close();
  });

  describe('tasks', () => {
    const create = (body: object) =>
      http().post('/tasks').set('Cookie', hr.cookie).send({ title: `${MARK} task`, ...body });

    it('creating with someone who can work tasks tells them; anyone else is refused', async () => {
      const before = await told(gro.userId, TASK_TITLE);
      const ok = await create({ assigneeUserId: gro.userId }).expect(201);
      expect(ok.body.assigneeUserId).toBe(gro.userId);
      expect(await told(gro.userId, TASK_TITLE)).toBe(before + 1);
      for (const id of wrong) await create({ assigneeUserId: id }).expect(400);
      expect(await owner.task.count({ where: { title: `${MARK} task`, assigneeUserId: { in: wrong } } })).toBe(0);
    });

    it('reassigning checks the same rule; clearing is allowed; taking it yourself tells nobody', async () => {
      const t = (await create({}).expect(201)).body as { id: string };
      const patch = (body: object) => http().patch(`/tasks/${t.id}`).set('Cookie', hr.cookie).send(body);
      for (const id of wrong) await patch({ assigneeUserId: id }).expect(400);
      const before = await told(hr.userId, TASK_TITLE);
      await patch({ assigneeUserId: hr.userId }).expect(200);
      expect(await told(hr.userId, TASK_TITLE)).toBe(before);
      const groBefore = await told(gro.userId, TASK_TITLE);
      await patch({ assigneeUserId: gro.userId }).expect(200);
      expect(await told(gro.userId, TASK_TITLE)).toBe(groBefore + 1);
      // Saving other fields with the SAME assignee is not a new assignment.
      await patch({ assigneeUserId: gro.userId, priority: 'high' }).expect(200);
      expect(await told(gro.userId, TASK_TITLE)).toBe(groBefore + 1);
      await patch({ assigneeUserId: null }).expect(200);
      expect((await owner.task.findUniqueOrThrow({ where: { id: t.id } })).assigneeUserId).toBeNull();
    });
  });

  describe('GRO procedures', () => {
    const create = (body: object) =>
      http().post('/gro-processes').set('Cookie', gro.cookie).send({ employeeId: empId, type: 'iqama_renewal', ...body });

    it('creating with someone who can work procedures tells them; anyone else is refused', async () => {
      const before = await told(hr.userId, PROC_TITLE);
      await create({ assigneeUserId: hr.userId }).expect(201);
      expect(await told(hr.userId, PROC_TITLE)).toBe(before + 1);
      for (const id of wrong) await create({ assigneeUserId: id }).expect(400);
      expect(await owner.groProcess.count({ where: { clientId: co, assigneeUserId: { in: wrong } } })).toBe(0);
    });

    it('reassigning checks the same rule; clearing is allowed; taking it yourself tells nobody', async () => {
      const p = (await create({}).expect(201)).body as { id: string };
      const patch = (body: object) => http().patch(`/gro-processes/${p.id}`).set('Cookie', gro.cookie).send(body);
      for (const id of wrong) await patch({ assigneeUserId: id }).expect(400);
      const self = await told(gro.userId, PROC_TITLE);
      await patch({ assigneeUserId: gro.userId }).expect(200);
      expect(await told(gro.userId, PROC_TITLE)).toBe(self);
      const before = await told(hr.userId, PROC_TITLE);
      await patch({ assigneeUserId: hr.userId }).expect(200);
      expect(await told(hr.userId, PROC_TITLE)).toBe(before + 1);
      await patch({ assigneeUserId: null }).expect(200);
      expect((await owner.groProcess.findUniqueOrThrow({ where: { id: p.id } })).assigneeUserId).toBeNull();
    });
  });
});
