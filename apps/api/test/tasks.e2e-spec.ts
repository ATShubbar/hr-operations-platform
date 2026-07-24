import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { addWorkingDays, isWorkingDay, TasksService } from '../src/modules/tasks/public-api';

// TASK-01: the Tasks registry + service (staff path). Service-level (HTTP + the
// own/assigned scope land in TASK-02) — proves create (audited, defaults), list
// with the own/assigned scope filter, and the Sun–Thu working-days helper.

describe('Tasks service (TASK-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let tasks: TasksService;
  const clientId = randomUUID();
  const alice = randomUUID();
  const bob = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    tasks = app.get(TasksService);
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId, resource: 'task' } });
    await owner.task.deleteMany({ where: { clientId } });
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

  it('computes Sun–Thu-aware due dates (skips Fri/Sat)', () => {
    // 2026-08-06 is a Thursday; +1 working day → Sunday 2026-08-09 (skip Fri/Sat).
    const thu = new Date(Date.UTC(2026, 7, 6));
    expect(isWorkingDay(thu)).toBe(true);
    expect(isWorkingDay(new Date(Date.UTC(2026, 7, 7)))).toBe(false); // Friday
    const next = addWorkingDays(thu, 1);
    expect(next.toISOString().slice(0, 10)).toBe('2026-08-09'); // Sunday
  });
});
