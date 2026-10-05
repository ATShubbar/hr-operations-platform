import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { TasksService } from '../src/modules/tasks/public-api';
import { cleanupHelperUsers, loginAsStaff } from './helpers/login';

// TASK-01: the Tasks registry + service (staff path). Service-level (HTTP + the
// own/assigned scope land in TASK-02) — proves create (audited, defaults) and list
// with the own/assigned scope filter. (Working-day maths lives in @hr/dates since
// TASK-05 removed the tasks module's own copy; its tests are there.)

describe('Tasks service (TASK-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let tasks: TasksService;
  const clientId = randomUUID();
  const alice = randomUUID();
  // ASSIGN-01: an assignee must be a real person who works tasks — bob is a
  // real (helper) GRO officer, set up below; alice only creates, so any id does.
  let bob = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    tasks = app.get(TasksService);
    bob = (await loginAsStaff(app, 'gro_officer')).userId;
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId, resource: 'task' } });
    await owner.task.deleteMany({ where: { clientId } });
    await owner.notification.deleteMany({ where: { recipientUserId: bob } });
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('creates a task with defaults (open / normal) and writes an audit entry', async () => {
    const created = await tasks.create({
      clientId,
      title: 'Prepare paperwork',
      createdByUserId: alice,
    });
    expect(created.status).toBe('open');
    expect(created.priority).toBe('normal');

    const audit = await owner.auditEntry.findMany({
      where: { clientId, resource: 'task', action: 'create' },
    });
    expect(audit.length).toBe(1);
    expect(JSON.stringify(audit[0]?.after)).toContain('Prepare paperwork');
  });

  it('lists with an own/assigned scope filter', async () => {
    // alice creates one; bob is assigned another (created by alice)
    await tasks.create({ clientId, title: 'Alice task', createdByUserId: alice });
    await tasks.create({ clientId, title: 'Bob task', createdByUserId: alice, assigneeUserId: bob });

    const all = await tasks.list({ clientId });
    expect(all.length).toBeGreaterThanOrEqual(3);

    const bobScoped = await tasks.list({ clientId, scopeUserId: bob });
    expect(bobScoped.every((t) => t.createdByUserId === bob || t.assigneeUserId === bob)).toBe(true);
    expect(bobScoped.some((t) => t.title === 'Bob task')).toBe(true);
    expect(bobScoped.some((t) => t.title === 'Alice task')).toBe(false);
  });

});
