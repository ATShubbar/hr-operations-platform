import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { CandidatesService, VacanciesService } from '../src/modules/recruitment/public-api';

// REC-03: the candidate foundation. No HTTP surface yet (REC-04). Exercises
// CandidatesService directly and proves: create validates the vacancy + DERIVES
// clientId from it + audits; update audits before/after; list filters by
// vacancy/stage; candidates start at stage 'applied'.

describe('Recruitment — CandidatesService (REC-03)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let candidates: CandidatesService;
  let vacancies: VacanciesService;
  let clientId: string;
  let vacancyId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    candidates = app.get(CandidatesService);
    vacancies = app.get(VacanciesService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة المرشحين', nameEn: 'REC-03 Client', status: 'active' },
    });
    clientId = c.id;
    const v = await vacancies.create({ clientId, titleAr: 'محاسب', titleEn: 'Accountant' });
    vacancyId = v.id;
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.candidate.deleteMany({ where: { id: { in: createdIds } } });
    await owner.vacancy.deleteMany({ where: { id: vacancyId } });
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('creates a candidate — derives clientId from the vacancy, defaults stage, audits', async () => {
    const row = await candidates.create({
      vacancyId,
      nameAr: 'سالم',
      nameEn: 'Salem',
      email: 'salem@example.com',
    });
    createdIds.push(row.id);

    expect(row.vacancyId).toBe(vacancyId);
    expect(row.clientId).toBe(clientId); // DERIVED from the vacancy, not supplied
    expect(row.stage).toBe('applied'); // default
    expect(row.email).toBe('salem@example.com');

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'candidate', action: 'create', clientId },
    });
    expect(entries).toHaveLength(1);
    expect((entries[0]?.after as { nameEn?: string }).nameEn).toBe('Salem');
  });

  it('rejects a candidate for an unknown vacancy', async () => {
    await expect(
      candidates.create({
        vacancyId: '00000000-0000-4000-8000-000000000000',
        nameAr: 'x',
        nameEn: 'x',
      }),
    ).rejects.toThrow(/Unknown vacancy/);
  });

  it('updates a candidate and audits the before/after', async () => {
    const created = await candidates.create({ vacancyId, nameAr: 'نورة', nameEn: 'Noura' });
    createdIds.push(created.id);

    const updated = await candidates.update(created.id, { phone: '+966500000000', nameEn: 'Noura H.' });
    expect(updated?.phone).toBe('+966500000000');
    expect(updated?.nameEn).toBe('Noura H.');

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'candidate', action: 'update', clientId },
    });
    expect(entries).toHaveLength(1);
    expect((entries[0]?.before as { nameEn?: string }).nameEn).toBe('Noura');
    expect((entries[0]?.after as { nameEn?: string }).nameEn).toBe('Noura H.');
  });

  it('lists candidates filtered by vacancy', async () => {
    const rows = await candidates.list({ vacancyId });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((c) => c.vacancyId === vacancyId)).toBe(true);
  });

  it('returns null when updating a missing candidate', async () => {
    const missing = await candidates.update('00000000-0000-4000-8000-000000000000', { nameEn: 'x' });
    expect(missing).toBeNull();
  });
});
