import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { GroProcessesService } from '../src/modules/gro/public-api';

// GRO-01: the government-process foundation. No HTTP surface yet (GRO-02).
// Exercises GroProcessesService directly and proves: create defaults to
// not_started + audits; update audits before/after; list filters by
// client/employee — all scoped to the process's client.

describe('GRO — GroProcessesService (GRO-01)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let gro: GroProcessesService;
  let clientId: string;
  const employeeId = 'a1a1a1a1-0000-4000-8000-000000000001'; // bare cross-module ref
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    gro = app.get(GroProcessesService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة الجوازات', nameEn: 'GRO-01 Client', status: 'active' },
    });
    clientId = c.id;
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'gro-process', clientId } });
    await owner.groProcess.deleteMany({ where: { id: { in: createdIds } } });
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('creates a process (not_started by default) and audits it in the same transaction', async () => {
    const row = await gro.create({
      clientId,
      employeeId,
      type: 'iqama_renewal',
      referenceNumber: 'MUQ-1',
    });
    createdIds.push(row.id);

    expect(row.clientId).toBe(clientId);
    expect(row.employeeId).toBe(employeeId);
    expect(row.type).toBe('iqama_renewal');
    expect(row.status).toBe('not_started'); // default

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'gro-process', action: 'create', clientId },
    });
    expect(entries).toHaveLength(1);
    expect((entries[0]?.after as { type?: string }).type).toBe('iqama_renewal');
  });

  it('updates a process and audits before/after', async () => {
    const created = await gro.create({ clientId, employeeId, type: 'exit_reentry' });
    createdIds.push(created.id);

    const updated = await gro.update(created.id, { referenceNumber: 'MUQ-2', notes: 'submitted online' });
    expect(updated?.referenceNumber).toBe('MUQ-2');
    expect(updated?.notes).toBe('submitted online');

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'gro-process', action: 'update', clientId },
    });
    expect(entries).toHaveLength(1);
  });

  it('lists processes filtered by employee', async () => {
    const rows = await gro.list({ employeeId });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((p) => p.employeeId === employeeId)).toBe(true);
  });

  it('returns null when updating a missing process', async () => {
    const missing = await gro.update('00000000-0000-4000-8000-000000000000', { notes: 'x' });
    expect(missing).toBeNull();
  });
});
