import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { CandidatesService, VacanciesService } from '../src/modules/recruitment/public-api';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

// REC-05: the CandidateHired → Employees flow (4th ADR-004 event). Advancing a
// candidate to `hired` publishes CandidateHiredEvent; the Employees module creates
// the employee record. Hiring requires a nationality on file (else the employee
// would be ill-formed). `hired` is terminal, so exactly one employee is created.

describe('Recruitment — CandidateHired → Employees (REC-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let candidates: CandidatesService;
  let vacancies: VacanciesService;
  let recruiter: TestPrincipal;
  let clientId: string;
  let vacancyId: string;

  const advance = (id: string, stage: string) =>
    request(http).post(`/candidates/${id}/stage`).set('Cookie', recruiter.cookie).send({ stage });

  // Walk a candidate applied → offer (the legal path), leaving it ready to hire.
  const toOffer = async (id: string) => {
    await advance(id, 'screening').expect(200);
    await advance(id, 'interview').expect(200);
    await advance(id, 'offer').expect(200);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    candidates = app.get(CandidatesService);
    vacancies = app.get(VacanciesService);
    recruiter = await loginAsStaff(app, 'recruiter');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const c = await owner.client.create({
      data: { nameAr: 'شركة التوظيف', nameEn: 'REC-05 Client', status: 'active' },
    });
    clientId = c.id;
    const v = await vacancies.create({ clientId, titleAr: 'محاسب', titleEn: 'Accountant' });
    vacancyId = v.id;
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.employee.deleteMany({ where: { clientId } });
    await owner.candidate.deleteMany({ where: { clientId } });
    await owner.vacancy.deleteMany({ where: { id: vacancyId } });
    await cleanupHelperUsers(app);
    await owner.client.delete({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('hiring a candidate creates an employee for the same client (with name + nationality)', async () => {
    const created = await candidates.create({
      vacancyId,
      nameAr: 'سالم',
      nameEn: 'Salem Hired',
      nationality: 'SA',
    });
    await toOffer(created.id);
    const hired = await advance(created.id, 'hired').expect(200);
    expect(hired.body.stage).toBe('hired');

    // The event is awaited in-process, so the employee exists by now.
    const employees = await owner.employee.findMany({
      where: { clientId, nameEn: 'Salem Hired' },
    });
    expect(employees).toHaveLength(1);
    expect(employees[0]?.nationality).toBe('SA');
    expect(employees[0]?.contractType).toBe('unlimited'); // onboarding default
    expect(employees[0]?.employmentStatus).toBe('active');

    // …and the creation was audited by Employees (employee.create).
    const audit = await owner.auditEntry.findMany({
      where: { resource: 'employee', action: 'create', clientId },
    });
    expect(audit.length).toBe(1);
  });

  it('refuses to hire a candidate with no nationality on file (400), creating no employee', async () => {
    const created = await candidates.create({ vacancyId, nameAr: 'نورة', nameEn: 'Noura NoNat' });
    await toOffer(created.id);
    await advance(created.id, 'hired').expect(400);

    const employees = await owner.employee.findMany({ where: { clientId, nameEn: 'Noura NoNat' } });
    expect(employees).toHaveLength(0);
  });

  it('`hired` is terminal — a second transition is rejected, so only one employee exists', async () => {
    const created = await candidates.create({
      vacancyId,
      nameAr: 'خالد',
      nameEn: 'Khalid Once',
      nationality: 'EG',
    });
    await toOffer(created.id);
    await advance(created.id, 'hired').expect(200);
    // second attempt from the terminal `hired` stage → 400
    await advance(created.id, 'withdrawn').expect(400);

    const employees = await owner.employee.findMany({ where: { clientId, nameEn: 'Khalid Once' } });
    expect(employees).toHaveLength(1);
  });
});
