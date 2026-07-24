import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { RequestsService } from '../src/modules/requests/public-api';

// TASK-03 (ADR-004): a client request spawns an internal task. Creating a request
// publishes RequestCreated (Requests → events bus → Tasks handler), which creates
// a task linked back to the request — the producer never referencing Tasks.
// publish() awaits handlers, so the spawned task is observable synchronously.

describe('Request spawns a Task (TASK-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let requests: RequestsService;
  const clientId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    requests = app.get(RequestsService);
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({
      where: { clientId, resource: { in: ['request', 'task'] } },
    });
    await owner.task.deleteMany({ where: { clientId } });
    await owner.request.deleteMany({ where: { clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('creating a request spawns an unassigned task linked back to it', async () => {
    const req = await requests.create({
      clientId,
      type: 'letter',
      title: 'Salary certificate',
      createdByUserId: randomUUID(),
    });

    const spawned = await owner.task.findMany({ where: { requestId: req.id } });
    expect(spawned.length).toBe(1);
    const task = spawned[0];
    expect(task?.clientId).toBe(clientId);
    expect(task?.title).toContain('Salary certificate');
    expect(task?.status).toBe('open');
    expect(task?.createdByUserId).toBeNull(); // system-spawned → admin triage queue
    expect(task?.assigneeUserId).toBeNull();
    expect(task?.dueDate).not.toBeNull(); // 3-working-day SLA set
  });
});
