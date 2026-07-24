import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { VacanciesService } from '../src/modules/recruitment/public-api';

// REC-01: the vacancy foundation. No HTTP surface yet (that lands with REC-02),
// so this exercises VacanciesService directly and proves each mutation writes its
// audit entry in the SAME transaction (AUDIT-03), scoped to the vacancy's client.

describe('Recruitment — VacanciesService (REC-01)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let vacancies: VacanciesService;
  let clientId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    vacancies = app.get(VacanciesService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة التوظيف', nameEn: 'REC-01 Client', status: 'active' },
    });
    clientId = c.id;
  });

  afterAll(async () => {
    if (createdIds.length) {
      await owner.auditEntry.deleteMany({ where: { resource: 'vacancy', clientId } });
      await owner.vacancy.deleteMany({ where: { id: { in: createdIds } } });
    }
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('creates a vacancy (draft by default) and audits it in the same transaction', async () => {
    const row = await vacancies.create({
      clientId,
      titleAr: 'محاسب',
      titleEn: 'Accountant',
      department: 'Finance',
    });
    createdIds.push(row.id);

    expect(row.clientId).toBe(clientId);
    expect(row.titleEn).toBe('Accountant');
    expect(row.status).toBe('draft'); // new vacancies start draft
    expect(row.headcount).toBe(1); // default

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'vacancy', action: 'create', clientId },
    });
    expect(entries).toHaveLength(1);
    expect((entries[0]?.after as { titleEn?: string }).titleEn).toBe('Accountant');
  });

  it('updates a vacancy and audits the before/after', async () => {
    const created = await vacancies.create({ clientId, titleAr: 'مطور', titleEn: 'Developer' });
    createdIds.push(created.id);

    const updated = await vacancies.update(created.id, { titleEn: 'Senior Developer', headcount: 3 });
    expect(updated?.titleEn).toBe('Senior Developer');
    expect(updated?.headcount).toBe(3);

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'vacancy', action: 'update', clientId },
    });
    expect(entries).toHaveLength(1);
    expect((entries[0]?.before as { titleEn?: string }).titleEn).toBe('Developer');
    expect((entries[0]?.after as { titleEn?: string }).titleEn).toBe('Senior Developer');
  });

  it('returns null when updating a missing vacancy (no audit written)', async () => {
    const missing = await vacancies.update('00000000-0000-4000-8000-000000000000', { titleEn: 'x' });
    expect(missing).toBeNull();
  });
});
