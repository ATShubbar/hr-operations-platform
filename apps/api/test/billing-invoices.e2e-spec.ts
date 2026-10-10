import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { dayIn } from '@hr/dates';
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

// BILL-05 (ADR-020): INVOICE RECORDS. The invoice is issued from the accounting
// system; the Administrator records it here — its number as issued, its dates,
// its amount — with the fees it recovers, and later whether it was paid.
// "Overdue" and a client's standing are DERIVED, never set. An invoice record
// is corrected, not removed, unless it is unpaid and recovers no fee.
const MARK = 'BILL-05-test';
const db = (url?: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
// Days are counted from today WHERE THE BUSINESS IS (the system timezone), as
// the service does: between midnight and 03:00 in Riyadh, UTC is still on
// yesterday, and "due today" measured in UTC would already be overdue.
const day = (offset: number): string => {
  const d = dayIn(new Date(), 'Asia/Riyadh');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const INVOICE_KEYS = [
  'amountHalalas',
  'clientId',
  'dueOn',
  'fees',
  'feesHalalas',
  'id',
  'issuedOn',
  'number',
  'overdue',
  'paidOn',
  'recordedAt',
  'recordedBy',
  'status',
];

describe('Invoice records (BILL-05, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let clientDb: PrismaClient;
  let staffDb: PrismaClient;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let rep: TestPrincipal;
  let employee: TestPrincipal;
  const ids = { co: '', other: '', a: '' };
  let n = 0;

  const http = () => request(app.getHttpServer());
  const invoiceBody = (over: Record<string, unknown> = {}) => ({
    number: `INV-${MARK}-${++n}`,
    issuedOn: day(-10),
    dueOn: day(20),
    amountHalalas: 1_264_500,
    ...over,
  });
  const create = (body: unknown, clientId = ids.co, who: TestPrincipal = admin) =>
    http()
      .post(`/billing/clients/${clientId}/invoices`)
      .set('Cookie', who.cookie)
      .send(body as object);
  const list = (clientId = ids.co, who: TestPrincipal = admin) =>
    http().get(`/billing/clients/${clientId}/invoices`).set('Cookie', who.cookie);
  const patch = (id: string, body: unknown, who: TestPrincipal = admin) =>
    http()
      .patch(`/billing/invoices/${id}`)
      .set('Cookie', who.cookie)
      .send(body as object);
  const act = (
    id: string,
    action: 'paid' | 'unpaid' | 'remove',
    body: unknown = {},
    who: TestPrincipal = admin,
  ) =>
    http()
      .post(`/billing/invoices/${id}/${action}`)
      .set('Cookie', who.cookie)
      .send(body as object);
  const standing = async (clientId = ids.co) =>
    (await http().get(`/billing/clients/${clientId}`).set('Cookie', admin.cookie).expect(200)).body;
  const fee = async (amountHalalas: number, clientId = ids.co) =>
    (
      await http()
        .post('/fees')
        .set('Cookie', hr.cookie)
        .send({
          source: { kind: 'manual', clientId, label: 'Test fee' },
          authority: 'other',
          amountHalalas,
          paidOn: day(-3),
        })
        .expect(201)
    ).body as { id: string; ref: string };
  const feeStatus = async (id: string) =>
    (await owner.fee.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db(process.env.DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    staffDb = db(process.env.STAFF_DATABASE_URL);
    await cleanup();
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    ids.other = (await owner.client.create({ data: { nameAr: 'أخرى', nameEn: `${MARK} Y` } })).id;
    ids.a = (
      await owner.employee.create({
        data: {
          clientId: ids.co,
          nameAr: 'اختبار',
          nameEn: `${MARK} a`,
          nationality: 'IN',
          contractType: 'unlimited',
        },
      })
    ).id;
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
    await owner.invoice.deleteMany({ where: { clientId: { in: cos } } });
    await owner.billingTerms.deleteMany({ where: { clientId: { in: cos } } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await Promise.all([owner, clientDb, staffDb].map((c) => c.$disconnect()));
    await app.close();
  });

  it('no invoice recorded: an empty list and a standing of "none" — not "paid up"', async () => {
    expect((await list().expect(200)).body).toEqual({ invoices: [] });
    expect((await standing()).standing).toEqual({
      state: 'none',
      outstandingHalalas: 0,
      overdueHalalas: 0,
      overdueCount: 0,
    });
  });

  it('records an invoice with the fees it recovers: they become invoiced and leave what is owed', async () => {
    const f1 = await fee(15_000);
    const f2 = await fee(60_000);
    const untouched = await fee(7_000);
    expect((await standing()).unrecoveredFeesHalalas).toBe(82_000);

    const body = invoiceBody({ number: '  INV-2026-0001 ', feeIds: [f1.id, f2.id] });
    const res = await create(body).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(INVOICE_KEYS);
    expect(res.body).toMatchObject({
      clientId: ids.co,
      number: 'INV-2026-0001', // trimmed, otherwise as issued
      issuedOn: day(-10),
      dueOn: day(20),
      amountHalalas: 1_264_500,
      status: 'sent',
      paidOn: null,
      overdue: false,
      feesHalalas: 75_000,
      recordedBy: 'Layla Test',
    });
    expect(res.body.fees.map((f: { ref: string }) => f.ref).sort()).toEqual(
      [f1.ref, f2.ref].sort(),
    );

    expect(await feeStatus(f1.id)).toBe('invoiced');
    expect(await feeStatus(f2.id)).toBe('invoiced');
    expect(await feeStatus(untouched.id)).toBe('recorded');
    const after = await standing();
    expect(after.unrecoveredFeesHalalas).toBe(7_000);
    expect(after.standing).toEqual({
      state: 'current', // unpaid, but not yet due
      outstandingHalalas: 1_264_500,
      overdueHalalas: 0,
      overdueCount: 0,
    });

    expect((await list(ids.co, auditor).expect(200)).body.invoices).toHaveLength(1); // the Auditor reads
    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { clientId: ids.co, resource: 'invoice', action: 'create' },
    });
    expect(entry.resourceId).toBe(res.body.id);
    expect(entry.actorId).toBe(admin.userId);
    expect(entry.after).toMatchObject({ number: 'INV-2026-0001', amountHalalas: 1_264_500 });
    expect((entry.after as { feeRefs: string[] }).feeRefs.sort()).toEqual([f1.ref, f2.ref].sort());

    // A fee on an invoice is no longer the officers' to void or correct.
    await http()
      .post(`/fees/${f1.id}/void`)
      .set('Cookie', hr.cookie)
      .send({ reason: 'Recorded twice' })
      .expect(409);
    await http()
      .patch(`/fees/${f1.id}`)
      .set('Cookie', hr.cookie)
      .send({ amountHalalas: 1 })
      .expect(409);
  });

  it('a number is recorded once per client, whatever its case — another client may hold the same', async () => {
    await create(invoiceBody({ number: 'inv-2026-0001' })).expect(409);
    await create(invoiceBody({ number: 'INV-2026-0001' }), ids.other).expect(201);
    expect((await list().expect(200)).body.invoices).toHaveLength(1);
  });

  it('refuses a record that is not one (400), and a fee it may not take (409) — recording nothing', async () => {
    const before = await owner.invoice.count({ where: { clientId: ids.co } });
    const good = await fee(1_000);
    const { number: _number, ...noNumber } = invoiceBody();
    const bad: unknown[] = [
      invoiceBody({ number: '   ' }),
      invoiceBody({ amountHalalas: 0 }),
      invoiceBody({ amountHalalas: 12.5 }),
      invoiceBody({ amountHalalas: 2_000_000_001 }),
      invoiceBody({ issuedOn: day(-10), dueOn: day(-11) }), // due before it was issued
      invoiceBody({ issuedOn: day(3) }), // not issued yet
      invoiceBody({ issuedOn: '2026-02-30' }),
      invoiceBody({ feeIds: [good.id, good.id] }),
      invoiceBody({ feeIds: ['not-an-id'] }),
      invoiceBody({ status: 'paid' }), // not the caller's to set
      invoiceBody({ vatHalalas: 100 }), // no VAT here
      noNumber,
    ];
    for (const body of bad) {
      const res = await create(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }

    const theirs = await fee(2_000, ids.other);
    const voided = await fee(3_000);
    await http()
      .post(`/fees/${voided.id}/void`)
      .set('Cookie', hr.cookie)
      .send({ reason: 'Recorded twice' })
      .expect(200);
    const taken = (
      await owner.fee.findFirstOrThrow({ where: { clientId: ids.co, status: 'invoiced' } })
    ).id;
    for (const feeId of [theirs.id, voided.id, taken, '99999999-9999-4999-8999-999999999999']) {
      // Each time WITH a fee that could be taken: nothing may be half-linked.
      const res = await create(invoiceBody({ feeIds: [good.id, feeId] }));
      expect(res.status, feeId).toBe(409);
    }
    expect(await feeStatus(good.id)).toBe('recorded');
    expect(await feeStatus(theirs.id)).toBe('recorded');
    expect(await owner.invoice.count({ where: { clientId: ids.co } })).toBe(before);
    await create(invoiceBody(), '99999999-9999-4999-8999-999999999999').expect(404);
  });

  it('overdue is derived: unpaid and PAST its due date — due today is not overdue', async () => {
    const dueToday = (
      await create(invoiceBody({ dueOn: day(0), amountHalalas: 100_000 })).expect(201)
    ).body;
    const late = (
      await create(
        invoiceBody({ issuedOn: day(-40), dueOn: day(-10), amountHalalas: 300_000 }),
      ).expect(201)
    ).body;
    expect(dueToday.overdue).toBe(false);
    expect(late.overdue).toBe(true);

    const s = (await standing()).standing;
    expect(s).toEqual({
      state: 'overdue',
      outstandingHalalas: 1_264_500 + 100_000 + 300_000,
      overdueHalalas: 300_000,
      overdueCount: 1,
    });

    // Paying the late one is what clears the standing — nobody sets it.
    await act(late.id, 'paid', { paidOn: day(-41) }).expect(400); // before it was issued
    await act(late.id, 'paid', { paidOn: day(3) }).expect(400); // not paid yet
    await act(late.id, 'paid', {}).expect(400);
    const paid = (await act(late.id, 'paid', { paidOn: day(-1) }).expect(200)).body;
    expect(paid).toMatchObject({ status: 'paid', paidOn: day(-1), overdue: false });
    await act(late.id, 'paid', { paidOn: day(-1) }).expect(409); // already paid
    expect((await standing()).standing).toEqual({
      state: 'current',
      outstandingHalalas: 1_264_500 + 100_000,
      overdueHalalas: 0,
      overdueCount: 0,
    });

    // A paid record is settled: not corrected, not removed — until un-marked.
    await patch(late.id, { amountHalalas: 1 }).expect(409);
    await act(late.id, 'remove').expect(409);
    const unpaid = (await act(late.id, 'unpaid').expect(200)).body;
    expect(unpaid).toMatchObject({ status: 'sent', paidOn: null, overdue: true });
    await act(late.id, 'unpaid').expect(409);
    expect((await standing()).standing.state).toBe('overdue');

    const actions = (
      await owner.auditEntry.findMany({
        where: { resource: 'invoice', resourceId: late.id },
        orderBy: { id: 'asc' },
      })
    ).map((e) => e.action);
    expect(actions).toEqual(['create', 'paid', 'unpaid']);
    await act(late.id, 'remove').expect(200);
    await act(dueToday.id, 'remove').expect(200);
  });

  it('a correction replaces what was recorded — and a fee left out goes back to waiting', async () => {
    const keep = await fee(11_000);
    const drop = await fee(22_000);
    const add = await fee(33_000);
    const inv = (await create(invoiceBody({ feeIds: [keep.id, drop.id] })).expect(201)).body;

    const res = await patch(inv.id, {
      number: 'INV-2026-0002',
      amountHalalas: 500_000,
      dueOn: day(45),
      feeIds: [keep.id, add.id],
    }).expect(200);
    expect(res.body).toMatchObject({
      number: 'INV-2026-0002',
      amountHalalas: 500_000,
      dueOn: day(45),
      feesHalalas: 44_000,
    });
    expect(await feeStatus(keep.id)).toBe('invoiced');
    expect(await feeStatus(drop.id)).toBe('recorded');
    expect(await feeStatus(add.id)).toBe('invoiced');
    expect((await owner.fee.findUniqueOrThrow({ where: { id: drop.id } })).invoiceId).toBeNull();

    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { resource: 'invoice', resourceId: inv.id, action: 'update' },
    });
    expect(entry.before).toMatchObject({ amountHalalas: 1_264_500 });
    expect(entry.after).toMatchObject({ amountHalalas: 500_000, number: 'INV-2026-0002' });
    expect((entry.before as { feeRefs: string[] }).feeRefs.sort()).toEqual(
      [keep.ref, drop.ref].sort(),
    );
    expect((entry.after as { feeRefs: string[] }).feeRefs.sort()).toEqual(
      [keep.ref, add.ref].sort(),
    );

    // Refused corrections change nothing.
    await patch(inv.id, {}).expect(400);
    await patch(inv.id, { dueOn: day(-30) }).expect(400); // before the day it was issued
    await patch(inv.id, { number: 'inv-2026-0001' }).expect(409); // another record's number
    await patch(inv.id, { clientId: ids.other }).expect(400);
    const taken = (
      await owner.fee.findFirstOrThrow({
        where: { clientId: ids.co, status: 'invoiced', invoiceId: { not: inv.id } },
      })
    ).id;
    await patch(inv.id, { feeIds: [taken] }).expect(409); // on another invoice
    expect(await feeStatus(keep.id)).toBe('invoiced'); // the refused replacement dropped nothing
    await patch('99999999-9999-4999-8999-999999999999', { amountHalalas: 1 }).expect(404);
  });

  it('is removed only while unpaid and recovering no fee — and then its number is free again', async () => {
    const f = await fee(9_000);
    const inv = (await create(invoiceBody({ number: 'INV-MISTAKE', feeIds: [f.id] })).expect(201))
      .body;
    await act(inv.id, 'remove').expect(409); // it recovers a fee: correct it instead
    expect(await feeStatus(f.id)).toBe('invoiced');

    await patch(inv.id, { feeIds: [] }).expect(200);
    expect(await feeStatus(f.id)).toBe('recorded');
    await act(inv.id, 'remove').expect(200);

    const numbers = (await list().expect(200)).body.invoices.map(
      (i: { number: string }) => i.number,
    );
    expect(numbers).not.toContain('INV-MISTAKE');
    const row = await owner.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.removedAt).not.toBeNull(); // kept, out of every list and figure
    expect(row.removedByUserId).toBe(admin.userId);
    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { resource: 'invoice', resourceId: inv.id, action: 'remove' },
    });
    expect(entry.before).toMatchObject({ number: 'INV-MISTAKE' });

    // Gone for every further act; its number can be recorded again.
    await act(inv.id, 'remove').expect(404);
    await act(inv.id, 'paid', { paidOn: day(0) }).expect(404);
    await patch(inv.id, { amountHalalas: 1 }).expect(404);
    await create(invoiceBody({ number: 'INV-MISTAKE' })).expect(201);
  });

  it('who: the Administrator keeps the records; the Auditor reads; officers, clients and employees see none', async () => {
    const inv = (
      await owner.invoice.findFirstOrThrow({ where: { clientId: ids.co, removedAt: null } })
    ).id;
    await create(invoiceBody(), ids.co, auditor).expect(403);
    await patch(inv, { amountHalalas: 1 }, auditor).expect(403);
    await act(inv, 'paid', { paidOn: day(0) }, auditor).expect(403);
    await act(inv, 'unpaid', {}, auditor).expect(403);
    await act(inv, 'remove', {}, auditor).expect(403);
    for (const who of [hr, gro, rep, employee]) {
      await list(ids.co, who).expect(403);
      await create(invoiceBody(), ids.co, who).expect(403);
      await patch(inv, { amountHalalas: 1 }, who).expect(403);
      await act(inv, 'paid', { paidOn: day(0) }, who).expect(403);
      await act(inv, 'remove', {}, who).expect(403);
    }
    await http().get(`/billing/clients/${ids.co}/invoices`).expect(401);
    await http().post(`/billing/clients/${ids.co}/invoices`).send(invoiceBody()).expect(401);
    await http().post(`/billing/invoices/${inv}/remove`).expect(401);
  });

  it('the database: clients see nothing, staff delete nothing, and a malformed row is refused', async () => {
    await expect(
      clientDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.client_id', ${ids.co}, true)`;
        return tx.invoice.findMany();
      }),
    ).rejects.toThrow(/permission denied/);
    const inv = await owner.invoice.findFirstOrThrow({
      where: { clientId: ids.co, removedAt: null },
    });
    await expect(staffDb.invoice.delete({ where: { id: inv.id } })).rejects.toThrow(
      /permission denied/,
    );

    const raw = (sql: string) => owner.$executeRawUnsafe(sql);
    const id = `'${inv.id}'::uuid`;
    // paid ⇔ a day it was paid
    await expect(raw(`UPDATE bil_invoices SET status = 'paid' WHERE id = ${id}`)).rejects.toThrow();
    await expect(
      raw(`UPDATE bil_invoices SET paid_on = CURRENT_DATE WHERE id = ${id}`),
    ).rejects.toThrow();
    await expect(
      raw(`UPDATE bil_invoices SET amount_halalas = 0 WHERE id = ${id}`),
    ).rejects.toThrow();
    await expect(
      raw(`UPDATE bil_invoices SET due_on = issued_on - 1 WHERE id = ${id}`),
    ).rejects.toThrow();
    await expect(raw(`UPDATE bil_invoices SET number = '  ' WHERE id = ${id}`)).rejects.toThrow();
    // a paid record is never a removed one
    await expect(
      raw(
        `UPDATE bil_invoices SET status = 'paid', paid_on = issued_on, removed_at = now() WHERE id = ${id}`,
      ),
    ).rejects.toThrow();
    // one live record per number per client, whatever its case
    await expect(
      raw(
        `INSERT INTO bil_invoices (client_id, number, issued_on, due_on, amount_halalas, updated_at)
         VALUES ('${ids.co}'::uuid, lower('${inv.number}'), CURRENT_DATE, CURRENT_DATE, 1, now())`,
      ),
    ).rejects.toThrow();
    // "invoiced" means ON an invoice, and only then
    const f = await fee(4_000);
    const fid = `'${f.id}'::uuid`;
    await expect(
      raw(`UPDATE bil_fees SET status = 'invoiced' WHERE id = ${fid}`),
    ).rejects.toThrow();
    await expect(raw(`UPDATE bil_fees SET invoice_id = ${id} WHERE id = ${fid}`)).rejects.toThrow();
    await expect(
      raw(
        `UPDATE bil_fees SET status = 'invoiced', invoice_id = '99999999-9999-4999-8999-999999999999' WHERE id = ${fid}`,
      ),
    ).rejects.toThrow(); // not an invoice that exists
  });
});

// The staff check, proven with a WIDENED policy: no client role holds `billing.*`.
describe('Invoice records — staff only, even for a role that held the permissions (BILL-05)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let rep: TestPrincipal;
  let clientId = '';
  let invoiceId = '';

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
    invoiceId = (
      await owner.invoice.create({
        data: {
          clientId,
          number: 'INV-W-1',
          issuedOn: new Date(`${day(-5)}T00:00:00Z`),
          dueOn: new Date(`${day(25)}T00:00:00Z`),
          amountHalalas: 1_000,
        },
      })
    ).id;
    rep = await loginAsClientRep(app, clientId, 'client_manager');
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await owner.invoice.deleteMany({ where: { clientId } });
    await owner.auditEntry.deleteMany({ where: { clientId } });
    await owner.client.deleteMany({ where: { id: clientId } });
    await owner.$disconnect();
    await app.close();
  });

  it('a client manager granted billing.* is still refused, for their OWN company', async () => {
    const http = () => request(app.getHttpServer());
    const as = (r: request.Test) => r.set('Cookie', rep.cookie);
    await as(http().get(`/billing/clients/${clientId}/invoices`)).expect(403);
    await as(http().post(`/billing/clients/${clientId}/invoices`))
      .send({ number: 'INV-W-2', issuedOn: day(-1), dueOn: day(29), amountHalalas: 5 })
      .expect(403);
    await as(http().patch(`/billing/invoices/${invoiceId}`))
      .send({ amountHalalas: 5 })
      .expect(403);
    await as(http().post(`/billing/invoices/${invoiceId}/paid`))
      .send({ paidOn: day(0) })
      .expect(403);
    await as(http().post(`/billing/invoices/${invoiceId}/unpaid`)).expect(403);
    await as(http().post(`/billing/invoices/${invoiceId}/remove`)).expect(403);
    const row = await owner.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(row).toMatchObject({ status: 'sent', amountHalalas: 1_000, removedAt: null });
    expect(await owner.invoice.count({ where: { clientId } })).toBe(1);
  });
});
