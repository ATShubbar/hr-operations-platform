import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/modules/storage/public-api';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
} from './helpers/login';

// SS-04 (ADR-011): GET /me/documents and GET /me/documents/:id/download.
//
// Companies, employees and documents are created HERE (one company opted in, one
// not) so flag state cannot race other specs. Requires MinIO (docker compose):
// one document gets a real blob, and the presigned link is actually fetched.

const MARK = 'SS-04-test';
const BLOB = Buffer.from(`${MARK} — the bytes of my iqama scan`);

describe('My documents — employee self-service (SS-04, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  const co = { on: '', off: '' };
  const emp = { me: '', colleague: '', outsider: '', terminated: '' };
  const doc = {
    soon: '',
    later: '',
    noExpiry: '', // mine, available
    pending: '',
    quarantined: '',
    deleted: '', // mine, not available
    colleague: '',
    company: '',
    outsider: '',
  };
  const blobKey = `${MARK}/${randomUUID()}`;

  let meSession: Awaited<ReturnType<typeof loginAsEmployee>> | undefined;
  const mine = async () => (meSession ??= await loginAsEmployee(app, emp.me));
  const http = () => request(app.getHttpServer());
  const list = (cookie?: string) => {
    const r = http().get('/me/documents');
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const download = (id: string, cookie?: string) => {
    const r = http().get(`/me/documents/${id}/download`);
    return cookie ? r.set('Cookie', cookie) : r;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);

    co.on = (await prisma.client.create({ data: { nameAr: 'مفعلة', nameEn: `${MARK} On` } })).id;
    co.off = (
      await prisma.client.create({ data: { nameAr: 'غير مفعلة', nameEn: `${MARK} Off` } })
    ).id;
    await prisma.clientSetting.create({
      data: { clientId: co.on, key: 'flag.employee-self-service', value: true },
    });

    const person = async (clientId: string, name: string, extra = {}) =>
      (
        await prisma.employee.create({
          data: {
            clientId,
            nameAr: 'اختبار',
            nameEn: `${MARK} ${name}`,
            nationality: 'EG',
            contractType: 'unlimited',
            ...extra,
          },
        })
      ).id;
    emp.me = await person(co.on, 'me');
    emp.colleague = await person(co.on, 'colleague');
    emp.outsider = await person(co.off, 'outsider');
    emp.terminated = await person(co.on, 'terminated', { employmentStatus: 'terminated' });

    const mk = async (
      clientId: string,
      employeeId: string | null,
      title: string,
      extra: {
        status?: 'pending' | 'available' | 'quarantined' | 'deleted';
        expiryDate?: Date | null;
        storageKey?: string;
      } = {},
    ) =>
      (
        await prisma.document.create({
          data: {
            clientId,
            employeeId,
            category: 'iqama',
            title: `${MARK} ${title}`,
            fileName: `${title}.pdf`,
            contentType: 'application/pdf',
            storageKey: extra.storageKey ?? `${MARK}/${title}`,
            status: extra.status ?? 'available',
            expiryDate: extra.expiryDate === undefined ? new Date('2027-01-01') : extra.expiryDate,
          },
        })
      ).id;

    doc.later = await mk(co.on, emp.me, 'later', { expiryDate: new Date('2028-06-01') });
    doc.soon = await mk(co.on, emp.me, 'soon', {
      expiryDate: new Date('2026-12-01'),
      storageKey: blobKey,
    });
    doc.noExpiry = await mk(co.on, emp.me, 'no-expiry', { expiryDate: null });
    doc.pending = await mk(co.on, emp.me, 'pending', { status: 'pending' });
    doc.quarantined = await mk(co.on, emp.me, 'quarantined', { status: 'quarantined' });
    doc.deleted = await mk(co.on, emp.me, 'deleted', { status: 'deleted' });
    doc.colleague = await mk(co.on, emp.colleague, 'colleague');
    doc.company = await mk(co.on, null, 'company');
    doc.outsider = await mk(co.off, emp.outsider, 'outsider');

    await storage.putObject(blobKey, BLOB, 'application/pdf');
  });

  afterAll(async () => {
    await storage.deleteObject(blobKey).catch(() => undefined);
    await prisma.document.deleteMany({ where: { title: { startsWith: MARK } } });
    await prisma.employee.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await prisma.clientSetting.deleteMany({ where: { clientId: { in: [co.on, co.off] } } });
    await prisma.client.deleteMany({ where: { id: { in: [co.on, co.off] } } });
    await cleanupHelperUsers(app);
    await app.close();
  });

  // ---- The list -----------------------------------------------------------

  it('lists ONLY my available documents, soonest expiry first, no-expiry last', async () => {
    const body = (await list((await mine()).cookie).expect(200)).body;
    expect(body.documents.map((d: { id: string }) => d.id)).toEqual([
      doc.soon,
      doc.later,
      doc.noExpiry,
    ]);
    // Never: my pending / quarantined / deleted, a colleague's, the company's,
    // another company's.
    const raw = JSON.stringify(body);
    for (const id of [
      doc.pending,
      doc.quarantined,
      doc.deleted,
      doc.colleague,
      doc.company,
      doc.outsider,
    ]) {
      expect(raw).not.toContain(id);
    }
  });

  it('returns EXACTLY the agreed document fields', async () => {
    const body = (await list((await mine()).cookie).expect(200)).body;
    expect(Object.keys(body)).toEqual(['documents']);
    expect(Object.keys(body.documents[0]).sort()).toEqual(
      ['category', 'contentType', 'expiryDate', 'fileName', 'id', 'issueDate', 'title'].sort(),
    );
    const raw = JSON.stringify(body);
    for (const leak of [
      'storageKey',
      'legalHold',
      'uploadedByUserId',
      'sizeBytes',
      'status',
      'clientId',
      'employeeId',
      'createdAt',
      MARK + '/',
    ]) {
      expect(raw).not.toContain(leak);
    }
  });

  // ---- The download -------------------------------------------------------

  it('gives a 300-second link to MY document, and the link returns the real file', async () => {
    const body = (await download(doc.soon, (await mine()).cookie).expect(200)).body;
    expect(body).toMatchObject({ method: 'GET', expiresInSeconds: 300 });
    const res = await fetch(body.url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(BLOB)).toBe(true);
  });

  it.each([
    ["a colleague's document (same company)", 'colleague'],
    ["the company's own document", 'company'],
    ["another company's document", 'outsider'],
    ['my PENDING document', 'pending'],
    ['my QUARANTINED document', 'quarantined'],
    ['my DELETED document', 'deleted'],
  ] as const)('%s → the same 404', async (_label, key) => {
    await download(doc[key], (await mine()).cookie).expect(404);
  });

  it('an unknown id and a malformed id → the same 404', async () => {
    const cookie = (await mine()).cookie;
    await download(randomUUID(), cookie).expect(404);
    await download('not-a-uuid', cookie).expect(404);
  });

  // ---- The gates /me already had apply here too ---------------------------

  it('an employee whose company has NOT opted in → 403 on both routes', async () => {
    const out = await loginAsEmployee(app, emp.outsider);
    await list(out.cookie).expect(403);
    await download(doc.outsider, out.cookie).expect(403);
  });

  it('a terminated employee → 403', async () => {
    const gone = await loginAsEmployee(app, emp.terminated);
    await list(gone.cookie).expect(403);
  });

  it('staff and client reps → 403; unauthenticated → 401', async () => {
    const staff = await loginAsStaff(app, 'hr_officer');
    const rep = await loginAsClientRep(app, co.on, 'client_manager');
    await list(staff.cookie).expect(403);
    await list(rep.cookie).expect(403);
    await download(doc.soon, staff.cookie).expect(403);
    await list().expect(401);
    await download(doc.soon).expect(401);
  });
});
