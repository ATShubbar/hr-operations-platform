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
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// THREAD-02 (ADR-016): files on a request's thread. Two layers, both proven:
// the API per role (upload → confirm → download, the checks confirm runs, who
// may remove, the 20-file limit, who is told) and the DATABASE fence on raw role
// connections (company / requester fences, every row born pending, the only
// legal moves — staff included — and no DELETE for anyone).
const MARK = 'THREAD-02-test';
const PDF = Buffer.from('%PDF-1.4\n% a tiny but honest PDF header\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

type Attachment = {
  id: string;
  status: string;
  fileName: string | null;
  sizeBytes: number | null;
  uploadedBy: { name: string | null; kind: string } | null;
  mine: boolean;
  removedAt: string | null;
};

describe('Request attachments (THREAD-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let staffDb: PrismaClient;
  let clientDb: PrismaClient;
  let empDb: PrismaClient;
  const co = { x: '', y: '' };
  const emp = { me: '', colleague: '' };
  const req = { x: '', y: '', mine: '', colleague: '', full: '' };
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let managerX: TestPrincipal;
  let me: TestPrincipal & { employeeId: string };

  const http = () => request(app.getHttpServer());
  const base = (who: TestPrincipal, requestId: string) =>
    who === me ? `/me/requests/${requestId}/attachments` : `/requests/${requestId}/attachments`;

  // create → PUT the bytes to storage → confirm. Returns the confirm response.
  async function upload(
    who: TestPrincipal,
    requestId: string,
    bytes: Buffer,
    meta: { fileName?: string; contentType?: string; sizeBytes?: number } = {},
  ): Promise<{ status: number; body: Attachment }> {
    const issued = await http()
      .post(base(who, requestId))
      .set('Cookie', who.cookie)
      .send({
        fileName: meta.fileName ?? 'letter.pdf',
        contentType: meta.contentType ?? 'application/pdf',
        sizeBytes: meta.sizeBytes ?? bytes.length,
      })
      .expect(201);
    const { attachment, upload: put } = issued.body as {
      attachment: Attachment;
      upload: { url: string; headers: Record<string, string> };
    };
    const res = await fetch(put.url, { method: 'PUT', headers: put.headers, body: bytes });
    expect(res.ok).toBe(true);
    const confirmed = await http()
      .post(`${base(who, requestId)}/${attachment.id}/confirm`)
      .set('Cookie', who.cookie);
    return { status: confirmed.status, body: confirmed.body as Attachment };
  }
  const list = async (who: TestPrincipal, requestId: string) =>
    (await http().get(base(who, requestId)).set('Cookie', who.cookie).expect(200)).body
      .attachments as Attachment[];
  const notified = (userId: string) =>
    owner.notification.count({
      where: { recipientUserId: userId, category: 'request', titleEn: 'New file on a request' },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const db = (url?: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
    owner = db(process.env.DATABASE_URL);
    staffDb = db(process.env.STAFF_DATABASE_URL);
    clientDb = db(process.env.CLIENT_DATABASE_URL);
    empDb = db(process.env.EMPLOYEE_DATABASE_URL);

    co.x = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} X` } })).id;
    co.y = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} Y` } })).id;
    await owner.clientSetting.create({ data: { clientId: co.x, key: 'flag.employee-self-service', value: true } });
    const person = async (name: string) =>
      (
        await owner.employee.create({
          data: { clientId: co.x, nameAr: 'موظف', nameEn: `${MARK} ${name}`, nationality: 'EG', contractType: 'unlimited' },
        })
      ).id;
    emp.me = await person('me');
    emp.colleague = await person('colleague');

    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    managerX = await loginAsClientRep(app, co.x);
    me = await loginAsEmployee(app, emp.me);
    const colleague = await loginAsEmployee(app, emp.colleague);

    const mk = (clientId: string, createdByUserId: string, title: string, requesterEmployeeId: string | null = null) =>
      owner.request.create({ data: { clientId, type: 'letter', title: `${MARK} ${title}`, createdByUserId, requesterEmployeeId } });
    req.x = (await mk(co.x, managerX.userId, 'raised by the manager')).id;
    req.y = (await mk(co.y, hr.userId, 'other company')).id;
    req.mine = (await mk(co.x, me.userId, 'raised by me', emp.me)).id;
    req.colleague = (await mk(co.x, colleague.userId, 'raised by a colleague', emp.colleague)).id;
    req.full = (await mk(co.x, managerX.userId, 'twenty files')).id;
  });

  afterAll(async () => {
    const companies = { in: [co.x, co.y] };
    await owner.requestAttachment.deleteMany({ where: { clientId: companies } });
    await owner.request.deleteMany({ where: { clientId: companies } });
    await owner.notification.deleteMany({
      where: { titleEn: 'New file on a request', recipientUserId: { in: [hr.userId, managerX.userId, me.userId] } },
    });
    await cleanupHelperUsers(app);
    await owner.employee.deleteMany({ where: { clientId: companies } });
    await owner.clientSetting.deleteMany({ where: { clientId: companies } });
    await owner.client.deleteMany({ where: { id: companies } });
    for (const c of [owner, staffDb, clientDb, empDb]) await c.$disconnect();
    await app.close();
  });

  describe('through the API', () => {
    it('staff upload a PDF: available after the check, named (no email), the requester is told, the bytes download', async () => {
      const before = await notified(managerX.userId);
      const { status, body } = await upload(hr, req.x, PDF, { fileName: 'salary-letter.pdf' });
      expect(status).toBe(200);
      expect(body).toMatchObject({ status: 'available', fileName: 'salary-letter.pdf', sizeBytes: PDF.length, mine: true });
      expect(Object.keys(body.uploadedBy ?? {}).sort()).toEqual(['kind', 'name']);
      expect(await notified(managerX.userId)).toBe(before + 1);

      const link = await http().get(`/requests/${req.x}/attachments/${body.id}/download`).set('Cookie', managerX.cookie).expect(200);
      const got = Buffer.from(await (await fetch(link.body.url)).arrayBuffer());
      expect(got.equals(PDF)).toBe(true);
    });

    it('the client manager uploads on their request; the assignee is told, not the uploader', async () => {
      await owner.request.update({ where: { id: req.x }, data: { assigneeUserId: hr.userId } });
      const hrBefore = await notified(hr.userId);
      const mgrBefore = await notified(managerX.userId);
      const { body } = await upload(managerX, req.x, PNG, { fileName: 'stamp.png', contentType: 'image/png' });
      expect(body.status).toBe('available');
      expect(await notified(hr.userId)).toBe(hrBefore + 1);
      expect(await notified(managerX.userId)).toBe(mgrBefore);
      const seen = await list(hr, req.x);
      expect(seen.find((a) => a.id === body.id)).toMatchObject({ mine: false, uploadedBy: { kind: 'client' } });
    });

    it('another company’s request is 404 to a client manager — list, upload, download', async () => {
      const [theirs] = await list(hr, req.x);
      await http().get(`/requests/${req.y}/attachments`).set('Cookie', managerX.cookie).expect(404);
      await http()
        .post(`/requests/${req.y}/attachments`)
        .set('Cookie', managerX.cookie)
        .send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(404);
      // A real file id under the wrong request is 404 too.
      await http().get(`/requests/${req.y}/attachments/${theirs!.id}/download`).set('Cookie', hr.cookie).expect(404);
    });

    it('the Auditor lists and downloads but cannot upload; GRO can', async () => {
      const [first] = await list(auditor, req.x);
      await http().get(`/requests/${req.x}/attachments/${first!.id}/download`).set('Cookie', auditor.cookie).expect(200);
      await http()
        .post(`/requests/${req.x}/attachments`)
        .set('Cookie', auditor.cookie)
        .send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(403);
      expect((await upload(gro, req.x, PDF)).body.status).toBe('available');
    });

    it('PDF, JPG or PNG up to 10 MB only; a name; nothing extra', async () => {
      const send = (body: object) => http().post(`/requests/${req.x}/attachments`).set('Cookie', hr.cookie).send(body);
      await send({ fileName: 'a.txt', contentType: 'text/plain', sizeBytes: 10 }).expect(400);
      await send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1 }).expect(400);
      await send({ fileName: '  ', contentType: 'application/pdf', sizeBytes: 10 }).expect(400);
      await send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10, extra: 1 }).expect(400);
    });

    it('confirm checks what actually landed: missing → 400, not a PDF → rejected, over 10 MB → rejected', async () => {
      const issued = await http()
        .post(`/requests/${req.x}/attachments`)
        .set('Cookie', hr.cookie)
        .send({ fileName: 'never.pdf', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(201);
      await http().post(`/requests/${req.x}/attachments/${issued.body.attachment.id}/confirm`).set('Cookie', hr.cookie).expect(400);

      const fake = await upload(hr, req.x, Buffer.from('plain text pretending to be a PDF'));
      expect(fake.body.status).toBe('rejected');
      const big = await upload(hr, req.x, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), { sizeBytes: 1000 });
      expect(big.body.status).toBe('rejected');
      // Neither is downloadable, and neither shows to anyone but the uploader.
      await http().get(`/requests/${req.x}/attachments/${fake.body.id}/download`).set('Cookie', hr.cookie).expect(409);
      const others = (await list(managerX, req.x)).map((a) => a.id);
      expect(others).not.toContain(fake.body.id);
      expect(others).not.toContain(big.body.id);
      expect((await list(hr, req.x)).map((a) => a.id)).toContain(fake.body.id);
    });

    it('an infected file (EICAR) is quarantined and never served', async () => {
      const { body } = await upload(hr, req.x, Buffer.from(EICAR_TEST_SIGNATURE));
      expect(body.status).toBe('quarantined');
      await http().get(`/requests/${req.x}/attachments/${body.id}/download`).set('Cookie', hr.cookie).expect(409);
      expect((await list(managerX, req.x)).map((a) => a.id)).not.toContain(body.id);
    });

    it('only the uploader removes a file; it stays as a "removed" row without name or download', async () => {
      const { body } = await upload(hr, req.x, PDF, { fileName: 'to-remove.pdf' });
      await http().delete(`/requests/${req.x}/attachments/${body.id}`).set('Cookie', gro.cookie).expect(403);
      await http().delete(`/requests/${req.x}/attachments/${body.id}`).set('Cookie', managerX.cookie).expect(403);
      // Nor may anyone else confirm someone's pending upload — it is invisible to
      // them (as in the list), so it is a 404, not a 403 that confirms it exists.
      const pending = await http()
        .post(`/requests/${req.x}/attachments`)
        .set('Cookie', hr.cookie)
        .send({ fileName: 'p.pdf', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(201);
      await http().post(`/requests/${req.x}/attachments/${pending.body.attachment.id}/confirm`).set('Cookie', gro.cookie).expect(404);

      const removed = await http().delete(`/requests/${req.x}/attachments/${body.id}`).set('Cookie', hr.cookie).expect(200);
      expect(removed.body).toMatchObject({ status: 'removed', fileName: null, sizeBytes: null });
      expect(removed.body.removedAt).toBeTruthy();
      const row = (await list(managerX, req.x)).find((a) => a.id === body.id);
      expect(row).toMatchObject({ status: 'removed', fileName: null, uploadedBy: { kind: 'staff' } });
      await http().get(`/requests/${req.x}/attachments/${body.id}/download`).set('Cookie', managerX.cookie).expect(409);
      await http().delete(`/requests/${req.x}/attachments/${body.id}`).set('Cookie', hr.cookie).expect(409);
    });

    it('a request carries at most 20 files (uploads in progress count)', async () => {
      for (let i = 0; i < 20; i++) {
        await http()
          .post(`/requests/${req.full}/attachments`)
          .set('Cookie', hr.cookie)
          .send({ fileName: `f${i}.pdf`, contentType: 'application/pdf', sizeBytes: 10 })
          .expect(201);
      }
      const res = await http()
        .post(`/requests/${req.full}/attachments`)
        .set('Cookie', hr.cookie)
        .send({ fileName: 'f21.pdf', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(409);
      expect(res.body.message).toMatch(/20/);
    });

    it('the employee uploads, lists, downloads and removes on their own request; a colleague’s is 404', async () => {
      const { body } = await upload(me, req.mine, PDF, { fileName: 'passport.pdf' });
      expect(body).toMatchObject({ status: 'available', mine: true, uploadedBy: { kind: 'employee' } });
      expect((await list(me, req.mine)).map((a) => a.id)).toContain(body.id);
      await http().get(`/me/requests/${req.mine}/attachments/${body.id}/download`).set('Cookie', me.cookie).expect(200);
      // The client manager sees the employee's file (ADR-011: reps see employee-raised requests).
      expect((await list(managerX, req.mine)).map((a) => a.id)).toContain(body.id);

      await http().get(`/me/requests/${req.colleague}/attachments`).set('Cookie', me.cookie).expect(404);
      await http()
        .post(`/me/requests/${req.colleague}/attachments`)
        .set('Cookie', me.cookie)
        .send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 })
        .expect(404);
      // The staff routes stay closed to an employee.
      await http().get(`/requests/${req.mine}/attachments`).set('Cookie', me.cookie).expect(403);

      await http().delete(`/me/requests/${req.mine}/attachments/${body.id}`).set('Cookie', me.cookie).expect(200);
    });

    it('every upload, check and removal is audited as request-attachment', async () => {
      const count = (action: string) =>
        owner.auditEntry.count({ where: { resource: 'request-attachment', action, clientId: co.x } });
      expect(await count('create')).toBeGreaterThanOrEqual(5);
      expect(await count('confirm')).toBeGreaterThanOrEqual(5);
      expect(await count('remove')).toBeGreaterThanOrEqual(2);
    });
  });

  describe('the database fence', () => {
    const asClientX = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
      clientDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.client_id', ${co.x}, true)`;
        return fn(tx as unknown as PrismaClient);
      });
    const asMe = <T>(fn: (tx: PrismaClient) => Promise<T>) =>
      empDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.employee_id', ${emp.me}, true)`;
        return fn(tx as unknown as PrismaClient);
      });
    let n = 0;
    const row = (requestId: string, extra: object = {}) => ({
      requestId,
      clientId: co.x,
      requesterEmployeeId: null as string | null,
      uploadedByUserId: managerX.userId,
      fileName: 'forged.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      storageKey: `${MARK}/forged/${Date.now()}-${n++}`,
      ...extra,
    });

    it('a client manager cannot attach to another company’s request, or copy the requester wrongly', async () => {
      await expect(asClientX((tx) => tx.requestAttachment.create({ data: row(req.y) }))).rejects.toThrow();
      await expect(
        asClientX((tx) => tx.requestAttachment.create({ data: row(req.mine, { requesterEmployeeId: null }) })),
      ).rejects.toThrow();
    });

    it('an employee cannot attach to a colleague’s request — even labelled with their own id', async () => {
      await expect(
        asMe((tx) =>
          tx.requestAttachment.create({ data: row(req.colleague, { requesterEmployeeId: emp.colleague, uploadedByUserId: me.userId }) }),
        ),
      ).rejects.toThrow();
      await expect(
        asMe((tx) =>
          tx.requestAttachment.create({ data: row(req.colleague, { requesterEmployeeId: emp.me, uploadedByUserId: me.userId }) }),
        ),
      ).rejects.toThrow();
      const seen = await asMe((tx) => tx.requestAttachment.findMany({ select: { requesterEmployeeId: true } }));
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((a) => a.requesterEmployeeId === emp.me)).toBe(true);
    });

    it('no role inserts a file as already checked — staff included', async () => {
      const scanned = { status: 'available' as const, confirmedAt: new Date() };
      await expect(staffDb.requestAttachment.create({ data: row(req.x, scanned) })).rejects.toThrow();
      await expect(asClientX((tx) => tx.requestAttachment.create({ data: row(req.x, scanned) }))).rejects.toThrow();
    });

    it('only the legal moves, for every role: removed never returns, pending never skips the check, names never change', async () => {
      const removed = await owner.requestAttachment.findFirstOrThrow({ where: { requestId: req.x, status: 'removed' } });
      await expect(
        staffDb.requestAttachment.update({ where: { id: removed.id }, data: { status: 'available', removedAt: null } }),
      ).rejects.toThrow();
      const pending = await owner.requestAttachment.findFirstOrThrow({ where: { requestId: req.x, status: 'pending' } });
      await expect(
        staffDb.requestAttachment.update({
          where: { id: pending.id },
          data: { status: 'removed', confirmedAt: new Date(), removedAt: new Date() },
        }),
      ).rejects.toThrow();
      const available = await owner.requestAttachment.findFirstOrThrow({ where: { requestId: req.x, status: 'available' } });
      await expect(
        staffDb.requestAttachment.update({ where: { id: available.id }, data: { status: 'pending', confirmedAt: null } }),
      ).rejects.toThrow();
      await expect(
        asClientX((tx) => tx.requestAttachment.update({ where: { id: available.id }, data: { fileName: 'renamed.pdf' } })),
      ).rejects.toThrow();
      expect((await owner.requestAttachment.findUniqueOrThrow({ where: { id: available.id } })).status).toBe('available');
    });

    it('nobody deletes a file row — staff included', async () => {
      const any = await owner.requestAttachment.findFirstOrThrow({ where: { requestId: req.x } });
      await expect(staffDb.requestAttachment.delete({ where: { id: any.id } })).rejects.toThrow();
      await expect(asClientX((tx) => tx.requestAttachment.delete({ where: { id: any.id } }))).rejects.toThrow();
      expect(await owner.requestAttachment.count({ where: { id: any.id } })).toBe(1);
    });
  });
});
