import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EventBus } from '../src/modules/events/public-api';
import { DocumentExpiringEvent } from '../src/modules/document-expiry/public-api';

// GRO-05: the DocumentExpiring → GRO auto-spawn (5th ADR-004 flow). A document
// nearing expiry auto-opens a GRO renewal process for its employee. Idempotent:
// the event fires once per tier, so at most one process per source document.

describe('GRO — DocumentExpiring auto-spawn (GRO-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let bus: EventBus;
  let clientId: string;
  const employeeId = randomUUID();

  const emit = (documentId: string, category: 'iqama' | 'visa' | 'contract', employee: string | null, tier: number) =>
    bus.publish(
      new DocumentExpiringEvent(
        documentId,
        clientId,
        employee,
        category,
        `${category} of someone`,
        '2027-05-01',
        tier,
        tier,
        [],
        null,
      ),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    bus = app.get(EventBus);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة الانتهاء', nameEn: 'GRO-05 Client', status: 'active' },
    });
    clientId = c.id;
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.groProcess.deleteMany({ where: { clientId } });
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('spawns an iqama_renewal process for an expiring iqama document', async () => {
    const documentId = randomUUID();
    await emit(documentId, 'iqama', employeeId, 30);

    const procs = await owner.groProcess.findMany({ where: { sourceDocumentId: documentId } });
    expect(procs).toHaveLength(1);
    expect(procs[0]?.type).toBe('iqama_renewal');
    expect(procs[0]?.employeeId).toBe(employeeId);
    expect(procs[0]?.status).toBe('not_started');
    expect(procs[0]?.dueDate?.toISOString().slice(0, 10)).toBe('2027-05-01');
  });

  it('is idempotent — a second tier for the same document spawns no duplicate', async () => {
    const documentId = randomUUID();
    await emit(documentId, 'iqama', employeeId, 30);
    await emit(documentId, 'iqama', employeeId, 7); // a later tier fires again
    await emit(documentId, 'iqama', employeeId, 0);

    const procs = await owner.groProcess.findMany({ where: { sourceDocumentId: documentId } });
    expect(procs).toHaveLength(1); // still one
  });

  it('spawns work_permit_renewal for a visa document', async () => {
    const documentId = randomUUID();
    await emit(documentId, 'visa', employeeId, 14);
    const procs = await owner.groProcess.findMany({ where: { sourceDocumentId: documentId } });
    expect(procs).toHaveLength(1);
    expect(procs[0]?.type).toBe('work_permit_renewal');
  });

  it('spawns nothing for a non-mapping category', async () => {
    const documentId = randomUUID();
    await emit(documentId, 'contract', employeeId, 30);
    expect(await owner.groProcess.count({ where: { sourceDocumentId: documentId } })).toBe(0);
  });

  it('spawns nothing when the document has no employee', async () => {
    const documentId = randomUUID();
    await emit(documentId, 'iqama', null, 30);
    expect(await owner.groProcess.count({ where: { sourceDocumentId: documentId } })).toBe(0);
  });
});
