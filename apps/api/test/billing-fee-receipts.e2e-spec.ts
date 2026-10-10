import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { EICAR_TEST_SIGNATURE } from '../src/modules/storage/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// BILL-02 (ADR-020), the API half:
//   · a fee may carry ONE receipt — PDF, JPG or PNG up to 10 MB, checked after
//     upload like every other file (size, virus scan, real type) before anyone
//     can open it;
//   · reopening a sequence step VOIDS its fee — unless the fee is already on an
//     invoice, in which case it stays.
const MARK = 'BILL-02-test';
const PDF = Buffer.from('%PDF-1.4\n% a tiny but honest PDF header\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const day = (offset: number): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

interface Fee {
  id: string;
  status: string;
  receipt: { fileName: string; status: string } | null;
  voided: { by: string | null; reason: string } | null;
}

describe('Fee receipts and reopened steps (BILL-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let rep: TestPrincipal;
  const ids = { co: '', a: '', sequence: '' };

  const http = () => request(app.getHttpServer());
  const newFee = async (label = 'Attestation'): Promise<Fee> =>
    (
      await http()
        .post('/fees')
        .set('Cookie', hr.cookie)
        .send({
          source: { kind: 'manual', clientId: ids.co, label },
          authority: 'chamber',
          amountHalalas: 15_000,
          paidOn: day(-1),
        })
        .expect(201)
    ).body as Fee;
  const issue = (
    feeId: string,
    meta: { fileName?: string; contentType?: string; sizeBytes?: number } = {},
    who: TestPrincipal = hr,
  ) =>
    http()
      .post(`/fees/${feeId}/receipt`)
      .set('Cookie', who.cookie)
      .send({
        fileName: meta.fileName ?? 'receipt.pdf',
        contentType: meta.contentType ?? 'application/pdf',
        sizeBytes: meta.sizeBytes ?? PDF.length,
      });
  const upload = async (
    feeId: string,
    bytes: Buffer,
    meta: { fileName?: string; contentType?: string } = {},
  ): Promise<{ status: number; body: Fee }> => {
    const issued = await issue(feeId, { ...meta, sizeBytes: bytes.length }).expect(201);
    const put = (issued.body as { upload: { url: string; headers: Record<string, string> } })
      .upload;
    const res = await fetch(put.url, { method: 'PUT', headers: put.headers, body: bytes });
    expect(res.ok).toBe(true);
    const confirmed = await http().post(`/fees/${feeId}/receipt/confirm`).set('Cookie', hr.cookie);
    return { status: confirmed.status, body: confirmed.body as Fee };
  };
  const file = (step: string) =>
    http()
      .post(`/gro-sequences/${ids.sequence}/steps/${step}/file`)
      .set('Cookie', gro.cookie)
      .send({});
  const reopen = (step: string) =>
    http().post(`/gro-sequences/${ids.sequence}/steps/${step}/reopen`).set('Cookie', gro.cookie);
  const stepFee = (stepKey: string, amountHalalas = 200_000) =>
    http()
      .post('/fees')
      .set('Cookie', hr.cookie)
      .send({
        source: { kind: 'sequence_step', sequenceId: ids.sequence, stepKey },
        amountHalalas,
        paidOn: day(0),
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await cleanup();
    ids.co = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
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
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    rep = await loginAsClientRep(app, ids.co, 'client_manager');
    await owner.authUser.update({ where: { id: gro.userId }, data: { displayName: 'Tariq Test' } });
    ids.sequence = (
      await http()
        .post(`/employees/${ids.a}/sequences`)
        .set('Cookie', gro.cookie)
        .send({ kind: 'onboarding' })
        .expect(201)
    ).body.id as string;
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    const runs = (
      await owner.groSequence.findMany({ where: { clientId: { in: cos } }, select: { id: true } })
    ).map((r) => r.id);
    await owner.fee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.groSequenceStep.deleteMany({ where: { sequenceId: { in: runs } } });
    await owner.groSequence.deleteMany({ where: { id: { in: runs } } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await owner.$disconnect();
    await app.close();
  });

  describe('a receipt', () => {
    it('is uploaded, checked, and only then opens — as the bytes that were sent; the act is audited', async () => {
      const fee = await newFee();
      expect(fee.receipt).toBeNull();
      const { status, body } = await upload(fee.id, PDF, { fileName: 'إيصال الغرفة.pdf' });
      expect(status).toBe(200);
      expect(body.receipt).toEqual({ fileName: 'إيصال الغرفة.pdf', status: 'available' });

      const link = await http()
        .get(`/fees/${fee.id}/receipt`)
        .set('Cookie', auditor.cookie) // reading the ledger includes its receipts
        .expect(200);
      const got = Buffer.from(await (await fetch(link.body.url as string)).arrayBuffer());
      expect(got.equals(PDF)).toBe(true);

      const listed = (
        await http().get('/fees').query({ clientId: ids.co }).set('Cookie', hr.cookie).expect(200)
      ).body.fees as Fee[];
      expect(listed.find((f) => f.id === fee.id)?.receipt).toEqual(body.receipt);
      const actions = (
        await owner.auditEntry.findMany({
          where: { resource: 'fee', resourceId: fee.id },
          orderBy: { id: 'asc' },
        })
      ).map((e) => e.action);
      expect(actions).toEqual(['create', 'receipt-upload', 'receipt-confirm']);
    });

    it('must be a PDF, JPG or PNG of at most 10 MB — said up front, and checked against the file itself', async () => {
      const fee = await newFee();
      await issue(fee.id, { contentType: 'text/plain' }).expect(400);
      await issue(fee.id, { sizeBytes: 10 * 1024 * 1024 + 1 }).expect(400);
      await issue(fee.id, { fileName: '   ' }).expect(400);
      await http()
        .post(`/fees/${fee.id}/receipt`)
        .set('Cookie', hr.cookie)
        .send({ fileName: 'r.pdf', contentType: 'application/pdf', sizeBytes: 10, key: 'x' })
        .expect(400);
      // Nothing has arrived yet.
      await issue(fee.id).expect(201);
      await http().post(`/fees/${fee.id}/receipt/confirm`).set('Cookie', hr.cookie).expect(400);

      // Text claiming to be a PDF is refused, and is not served.
      const fake = await upload(fee.id, Buffer.from('plain text pretending to be a PDF'));
      expect(fake.body.receipt).toMatchObject({ status: 'rejected' });
      await http().get(`/fees/${fee.id}/receipt`).set('Cookie', hr.cookie).expect(404);

      // A refused receipt can simply be replaced.
      const png = await upload(fee.id, PNG, { fileName: 'stamp.png', contentType: 'image/png' });
      expect(png.body.receipt).toEqual({ fileName: 'stamp.png', status: 'available' });
    });

    it('an infected file is quarantined and never served', async () => {
      const fee = await newFee();
      const { body } = await upload(fee.id, Buffer.from(EICAR_TEST_SIGNATURE));
      expect(body.receipt).toMatchObject({ status: 'quarantined' });
      await http().get(`/fees/${fee.id}/receipt`).set('Cookie', hr.cookie).expect(404);
      const row = await owner.fee.findUniqueOrThrow({ where: { id: fee.id } });
      expect(row.receiptStatus).toBe('quarantined');
    });

    it('is one per fee: a second is refused until the first is removed; a void fee takes none', async () => {
      const fee = await newFee();
      await upload(fee.id, PDF);
      await issue(fee.id).expect(409);
      const removed = await http()
        .post(`/fees/${fee.id}/receipt/remove`)
        .set('Cookie', hr.cookie)
        .expect(200);
      expect((removed.body as Fee).receipt).toBeNull();
      await http().get(`/fees/${fee.id}/receipt`).set('Cookie', hr.cookie).expect(404);
      await http().post(`/fees/${fee.id}/receipt/remove`).set('Cookie', hr.cookie).expect(409);
      expect((await upload(fee.id, PDF)).body.receipt?.status).toBe('available');

      await http()
        .post(`/fees/${fee.id}/void`)
        .set('Cookie', hr.cookie)
        .send({ reason: 'Recorded twice' })
        .expect(200);
      await issue(fee.id).expect(409);
      // Its receipt stays readable: the record of what happened is not erased.
      await http().get(`/fees/${fee.id}/receipt`).set('Cookie', hr.cookie).expect(200);

      // A void fee with NO receipt takes none either (the case above is refused
      // for already having one, so it does not prove this rule by itself).
      const bare = await newFee('Voided before any receipt');
      await http()
        .post(`/fees/${bare.id}/void`)
        .set('Cookie', hr.cookie)
        .send({ reason: 'Recorded in error' })
        .expect(200);
      await issue(bare.id).expect(409);
      expect(
        (await owner.fee.findUniqueOrThrow({ where: { id: bare.id } })).receiptStatus,
      ).toBeNull();
    });

    it('who: officers attach and remove; the Auditor only opens; a client manager gets nothing', async () => {
      const fee = await newFee();
      await upload(fee.id, PDF);
      await issue(fee.id, {}, auditor).expect(403);
      await http()
        .post(`/fees/${fee.id}/receipt/confirm`)
        .set('Cookie', auditor.cookie)
        .expect(403);
      await http().post(`/fees/${fee.id}/receipt/remove`).set('Cookie', auditor.cookie).expect(403);
      await http().get(`/fees/${fee.id}/receipt`).set('Cookie', auditor.cookie).expect(200);
      await http().get(`/fees/${fee.id}/receipt`).set('Cookie', rep.cookie).expect(403);
      await issue(fee.id, {}, rep).expect(403);
      await http().get(`/fees/${fee.id}/receipt`).expect(401);
      await http()
        .get('/fees/99999999-9999-4999-8999-999999999999/receipt')
        .set('Cookie', hr.cookie)
        .expect(404);
    });
  });

  describe('reopening a step', () => {
    it('voids the fee recorded for it — by whoever reopened it, audited — and the step can be filed and charged again', async () => {
      await file('block-visa').expect(200);
      const fee = (await stepFee('block-visa').expect(201)).body as Fee;
      await reopen('block-visa').expect(200);

      const after = (
        await http().get('/fees').query({ clientId: ids.co }).set('Cookie', hr.cookie).expect(200)
      ).body.fees as Fee[];
      expect(after.find((f) => f.id === fee.id)).toMatchObject({
        status: 'void',
        voided: { by: 'Tariq Test', reason: 'system:step-reopened' },
      });
      const entry = await owner.auditEntry.findFirstOrThrow({
        where: { resource: 'fee', resourceId: fee.id, action: 'void' },
      });
      expect(entry.actorId).toBe(gro.userId);

      await file('block-visa').expect(200);
      await stepFee('block-visa', 210_000).expect(201);
    });

    it('leaves a fee that is already on an invoice exactly as it is', async () => {
      await file('visa-auth').expect(200);
      const fee = (await stepFee('visa-auth', 5_000).expect(201)).body as Fee;
      // An invoice record recovers it (BILL-05 does this through the API).
      await owner.fee.update({ where: { id: fee.id }, data: { status: 'invoiced' } });
      await reopen('visa-auth').expect(200);
      const row = await owner.fee.findUniqueOrThrow({ where: { id: fee.id } });
      expect(row).toMatchObject({ status: 'invoiced', voidedAt: null, amountHalalas: 5_000 });
      // …and it cannot be voided by hand either.
      await http()
        .post(`/fees/${fee.id}/void`)
        .set('Cookie', hr.cookie)
        .send({ reason: 'The step was reopened' })
        .expect(409);
    });

    it('a step with no fee reopens as before; cancelling a sequence touches no fee', async () => {
      await file('visa-auth').expect(200);
      await file('gamca').expect(200);
      const before = await owner.fee.count({ where: { clientId: ids.co, status: 'void' } });
      await reopen('gamca').expect(200);
      expect(await owner.fee.count({ where: { clientId: ids.co, status: 'void' } })).toBe(before);

      const live = await owner.fee.findMany({
        where: { sequenceId: ids.sequence, status: { not: 'void' } },
      });
      await http()
        .post(`/gro-sequences/${ids.sequence}/cancel`)
        .set('Cookie', gro.cookie)
        .expect(200);
      const after = await owner.fee.findMany({
        where: { sequenceId: ids.sequence, status: { not: 'void' } },
      });
      expect(after.map((f) => [f.id, f.status])).toEqual(live.map((f) => [f.id, f.status]));
      expect(live.length).toBe(2); // the re-recorded block-visa fee and the invoiced one
    });
  });
});
