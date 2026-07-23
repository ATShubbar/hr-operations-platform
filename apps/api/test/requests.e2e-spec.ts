import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { RequestsService } from '../src/modules/requests/public-api';

// REQ-01: the Requests registry + service (staff path). Driven at the service
// level (the HTTP + client-rep write path land in REQ-02) — proves create
// (audited, defaults), list, and find. Keyed to a synthetic client id so the
// assertions are exact regardless of other rows.

describe('Requests service (REQ-01, e2e)', () => {
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
    await owner.auditEntry.deleteMany({ where: { clientId, resource: 'request' } });
    await owner.request.deleteMany({ where: { clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('creates a request with defaults (open / normal) and writes an audit entry', async () => {
    const created = await requests.create({
      clientId,
      type: 'letter',
      title: 'Salary certificate for Ahmed',
      description: 'Addressed to the bank.',
      createdByUserId: randomUUID(),
    });
    expect(created.status).toBe('open');
    expect(created.priority).toBe('normal');
    expect(created.title).toBe('Salary certificate for Ahmed');

    const audit = await owner.auditEntry.findMany({
      where: { clientId, resource: 'request', action: 'create' },
    });
    expect(audit.length).toBe(1);
    // aud_entries.id is BigInt — assert on the `after` snapshot only, not the row.
    expect(JSON.stringify(audit[0]?.after)).toContain('Salary certificate for Ahmed');
  });

  it('lists by client and finds by id (honoring explicit fields)', async () => {
    const b = await requests.create({
      clientId,
      type: 'gro_service',
      title: 'Iqama renewal',
      priority: 'high',
      dueDate: new Date('2026-08-20'),
      createdByUserId: randomUUID(),
    });

    const list = await requests.list(clientId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.map((r) => r.id)).toContain(b.id);

    const found = await requests.findById(b.id);
    expect(found?.priority).toBe('high');
    expect(found?.type).toBe('gro_service');
  });
});
