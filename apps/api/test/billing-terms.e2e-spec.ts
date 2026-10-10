import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PolicyService } from '../src/modules/auth/public-api';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// BILL-04 (ADR-020): a client's commercial terms — a platform fee plus a rate
// per employee, billed on a cycle — and the ESTIMATE of the next invoice. The
// Administrator keeps the terms (`billing.*`); the Auditor reads; officers,
// client managers and employees see none of it. The estimate is arithmetic:
// the people UNDER MANAGEMENT (REP-06's rule) at the rate, plus the platform
// fee, for the cycle, plus the fees not yet recovered. No invoice, no VAT.
const MARK = 'BILL-04-test';
const db = (url?: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
const day = (offset: number): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const TERMS = {
  platformFeeHalalas: 350_000, // SAR 3,500 a month
  seatRateHalalas: 6_500, // SAR 65 per employee a month
  cycle: 'quarterly',
  poNumber: 'PO-TEST-2026-014',
  paymentTermsDays: 30,
};
const SUMMARY_KEYS = [
  'clientId',
  'estimate',
  'terms',
  'termsUpdatedAt',
  'termsUpdatedBy',
  'unrecoveredFeesHalalas',
];

describe('Commercial terms and the estimate (BILL-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let clientDb: PrismaClient;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let rep: TestPrincipal;
  let employee: TestPrincipal;
  const ids = { co: '', archived: '', a: '' };

  const http = () => request(app.getHttpServer());
  const summary = (clientId: string, who: TestPrincipal) =>
    http().get(`/billing/clients/${clientId}`).set('Cookie', who.cookie);
  const put = (clientId: string, body: unknown, who: TestPrincipal = admin) =>
    http()
      .put(`/billing/clients/${clientId}/terms`)
      .set('Cookie', who.cookie)
      .send(body as object);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    await cleanup();
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    ids.archived = (
      await owner.client.create({
        data: { nameAr: 'مؤرشفة', nameEn: `${MARK} archived`, status: 'inactive' },
      })
    ).id;
    const mk = async (
      clientId: string,
      name: string,
      employmentStatus: 'active' | 'on_leave' | 'terminated' | 'onboarding' = 'active',
    ) =>
      (
        await owner.employee.create({
          data: {
            clientId,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality: 'IN',
            contractType: 'unlimited',
            employmentStatus,
          },
        })
      ).id;
    // Three under management, one who left, one still on the way in.
    ids.a = await mk(ids.co, 'a');
    await mk(ids.co, 'b', 'on_leave');
    await mk(ids.co, 'c');
    await mk(ids.co, 'left', 'terminated');
    await mk(ids.co, 'arriving', 'onboarding');
    await mk(ids.archived, 'z');
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    rep = await loginAsClientRep(app, ids.co, 'client_manager');
    employee = await loginAsEmployee(app, ids.a);
    await owner.authUser.update({
      where: { id: admin.userId },
      data: { displayName: 'Layla Test' },
    });
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    await owner.fee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.billingTerms.deleteMany({ where: { clientId: { in: cos } } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await Promise.all([owner, clientDb].map((c) => c.$disconnect()));
    await app.close();
  });

  it('a client with no terms has none and no estimate — never zeros dressed as terms', async () => {
    const res = await summary(ids.co, admin).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(SUMMARY_KEYS);
    expect(res.body).toEqual({
      clientId: ids.co,
      terms: null,
      estimate: null,
      unrecoveredFeesHalalas: 0,
      termsUpdatedBy: null,
      termsUpdatedAt: null,
    });
  });

  it('the Administrator records the terms; the estimate is the arithmetic, over the people under management only', async () => {
    const saved = await put(ids.co, TERMS).expect(200);
    expect(saved.body.terms).toEqual(TERMS);
    expect(saved.body.termsUpdatedBy).toBe('Layla Test');

    const res = await summary(ids.co, auditor).expect(200); // the Auditor reads
    // 3 under management (active, on leave, active) — not the leaver, not the arrival.
    const monthly = 350_000 + 3 * 6_500;
    expect(res.body.estimate).toEqual({
      headcount: 3,
      platformFeeHalalas: 350_000,
      seatsHalalas: 19_500,
      monthlyHalalas: monthly,
      cycleMonths: 3,
      cycleHalalas: monthly * 3,
      annualHalalas: monthly * 12,
      nextInvoiceHalalas: monthly * 3, // no fees outstanding yet
    });
    expect(Object.keys(res.body.estimate).sort()).toEqual([
      'annualHalalas',
      'cycleHalalas',
      'cycleMonths',
      'headcount',
      'monthlyHalalas',
      'nextInvoiceHalalas',
      'platformFeeHalalas',
      'seatsHalalas',
    ]);
  });

  it('the next invoice adds every fee not yet recovered — not a void one, not one already invoiced', async () => {
    const fee = async (amountHalalas: number, paidOn = day(-1)) =>
      (
        await http()
          .post('/fees')
          .set('Cookie', hr.cookie)
          .send({
            source: { kind: 'manual', clientId: ids.co, label: 'Test fee' },
            authority: 'other',
            amountHalalas,
            paidOn,
          })
          .expect(201)
      ).body.id as string;
    await fee(15_000);
    await fee(60_000, day(-200)); // old, still owed
    const voided = await fee(5_000);
    await http()
      .post(`/fees/${voided}/void`)
      .set('Cookie', hr.cookie)
      .send({ reason: 'Recorded twice' })
      .expect(200);
    const invoiced = await fee(10_000);
    await owner.fee.update({ where: { id: invoiced }, data: { status: 'invoiced' } });

    const res = await summary(ids.co, admin).expect(200);
    const cycle = (350_000 + 3 * 6_500) * 3;
    expect(res.body.unrecoveredFeesHalalas).toBe(75_000);
    expect(res.body.estimate.cycleHalalas).toBe(cycle);
    expect(res.body.estimate.nextInvoiceHalalas).toBe(cycle + 75_000);
  });

  it('saving replaces the whole set, is audited before → after, and an archived company bills no seats', async () => {
    const next = {
      ...TERMS,
      cycle: 'annual',
      seatRateHalalas: 5_500,
      poNumber: null,
      paymentTermsDays: 45,
    };
    const res = await put(ids.co, next).expect(200);
    expect(res.body.terms).toEqual(next);
    expect(res.body.estimate).toMatchObject({ cycleMonths: 12, seatsHalalas: 16_500 });
    expect(await owner.billingTerms.count({ where: { clientId: ids.co } })).toBe(1);
    const entries = await owner.auditEntry.findMany({
      where: { clientId: ids.co, resource: 'billing-terms' },
      orderBy: { id: 'asc' },
    });
    expect(entries.map((e) => e.action)).toEqual(['create', 'update']);
    expect(entries[1]?.before).toMatchObject({ cycle: 'quarterly', seatRateHalalas: 6_500 });
    expect(entries[1]?.after).toMatchObject({ cycle: 'annual', seatRateHalalas: 5_500 });
    expect(entries[1]?.actorId).toBe(admin.userId);

    // Nobody at an archived company is under management: the platform fee only.
    const archived = await put(ids.archived, TERMS).expect(200);
    expect(archived.body.estimate).toMatchObject({ headcount: 0, seatsHalalas: 0 });
    expect(archived.body.estimate.monthlyHalalas).toBe(350_000);
  });

  it('refuses terms that are not terms (400) and changes nothing', async () => {
    const before = (await summary(ids.co, admin)).body.terms;
    const { cycle: _cycle, ...noCycle } = TERMS;
    const bad: unknown[] = [
      { ...TERMS, platformFeeHalalas: -1 },
      { ...TERMS, seatRateHalalas: 65.5 }, // whole halalas only
      { ...TERMS, platformFeeHalalas: 100_000_001 },
      { ...TERMS, cycle: 'weekly' },
      { ...TERMS, paymentTermsDays: 366 },
      { ...TERMS, paymentTermsDays: -1 },
      { ...TERMS, poNumber: '   ' },
      { ...TERMS, vatRate: 15 }, // the app calculates no VAT
      { ...TERMS, tier: 'enterprise' }, // the tier lives on the client's profile
      noCycle,
      {},
    ];
    for (const body of bad) {
      const res = await put(ids.co, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await summary(ids.co, admin)).body.terms).toEqual(before);
    await put('99999999-9999-4999-8999-999999999999', TERMS).expect(404);
    await summary('99999999-9999-4999-8999-999999999999', admin).expect(404);
  });

  it('who: only the Administrator changes terms; the Auditor reads; officers, clients and employees see none of it', async () => {
    await put(ids.co, TERMS, auditor).expect(403);
    for (const who of [hr, gro, rep, employee]) {
      await summary(ids.co, who).expect(403);
      await put(ids.co, TERMS, who).expect(403);
    }
    await http().get(`/billing/clients/${ids.co}`).expect(401);
    await http().put(`/billing/clients/${ids.co}/terms`).send(TERMS).expect(401);
    // Still the annual terms from the previous test.
    expect(
      (await owner.billingTerms.findUniqueOrThrow({ where: { clientId: ids.co } })).cycle,
    ).toBe('annual');
  });

  it('the database: a client manager cannot read the terms, and a malformed row is refused', async () => {
    await expect(
      clientDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.client_id', ${ids.co}, true)`;
        return tx.billingTerms.findMany();
      }),
    ).rejects.toThrow(/permission denied/);
    const raw = (sql: string) => owner.$executeRawUnsafe(sql);
    const id = `'${ids.co}'::uuid`;
    await expect(
      raw(`UPDATE bil_terms SET platform_fee_halalas = -1 WHERE client_id = ${id}`),
    ).rejects.toThrow();
    await expect(
      raw(`UPDATE bil_terms SET payment_terms_days = 400 WHERE client_id = ${id}`),
    ).rejects.toThrow();
    await expect(
      raw(
        `INSERT INTO bil_terms (client_id, platform_fee_halalas, seat_rate_halalas, cycle, payment_terms_days, updated_at)
         VALUES (${id}, 1, 1, 'monthly', 30, now())`,
      ),
    ).rejects.toThrow(); // one set of terms per client
  });
});

// The staff check, proven with a WIDENED policy: no client role holds `billing.*`.
describe('Commercial terms — staff only, even for a role that held the permissions (BILL-04)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let rep: TestPrincipal;
  let clientId = '';

  class WidenedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (role === 'client_manager' && permission.startsWith('billing.')) return true;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(WidenedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} widened` } }))
      .id;
    rep = await loginAsClientRep(app, clientId, 'client_manager');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await owner.billingTerms.deleteMany({ where: { clientId } });
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted billing.* is still refused, for their OWN company', async () => {
    const http = () => request(app.getHttpServer());
    await http().get(`/billing/clients/${clientId}`).set('Cookie', rep.cookie).expect(403);
    await http()
      .put(`/billing/clients/${clientId}/terms`)
      .set('Cookie', rep.cookie)
      .send(TERMS)
      .expect(403);
    expect(await owner.billingTerms.count({ where: { clientId } })).toBe(0);
  });
});
