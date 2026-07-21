import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// CLIENT-02: staff client-company management API. Per the matrix, all staff
// read; System/Company Admin create/update/archive. Mutations are audited.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const MARK = 'CLIENT-02-test';

interface ClientBody {
  id: string;
  name: { ar: string; en: string };
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

describe('Client management API (CLIENT-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient; // audit reads + cleanup
  let admin: TestPrincipal; // company_admin (enrolled) — full CRUD
  let staff: TestPrincipal; // hr_officer — read only
  let rep: TestPrincipal; // client_admin — no client.read
  const createdIds: string[] = [];

  const http = () => app.getHttpServer();

  async function createClient(cookie: string, en: string, ar = `${MARK}-ar`): Promise<ClientBody> {
    const res = await request(http())
      .post('/clients')
      .set('Cookie', cookie)
      .send({ name: { ar, en } })
      .expect(201);
    const body = res.body as ClientBody;
    createdIds.push(body.id);
    return body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    admin = await loginAsEnrolledStaff(app, 'company_admin');
    staff = await loginAsStaff(app, 'hr_officer');
    rep = await loginAsClientRep(app, CLIENT_A, 'client_admin');
  });

  afterAll(async () => {
    if (createdIds.length) {
      await owner.auditEntry.deleteMany({ where: { clientId: { in: createdIds } } });
      await owner.client.deleteMany({ where: { id: { in: createdIds } } });
    }
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/clients').expect(401);
    await request(http()).post('/clients').send({ name: { ar: 'x', en: 'y' } }).expect(401);
  });

  it('admin creates a client → 201 with the response shape', async () => {
    const body = await createClient(admin.cookie, `${MARK} create`);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.name).toEqual({ ar: `${MARK}-ar`, en: `${MARK} create` });
    expect(body.status).toBe('active');
    expect(typeof body.createdAt).toBe('string');
  });

  it('get by id and list include the created client', async () => {
    const created = await createClient(admin.cookie, `${MARK} readback`);
    const got = await request(http())
      .get(`/clients/${created.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect((got.body as ClientBody).id).toBe(created.id);

    const list = await request(http()).get('/clients').set('Cookie', admin.cookie).expect(200);
    expect((list.body.clients as ClientBody[]).some((c) => c.id === created.id)).toBe(true);
  });

  it('admin updates name and status', async () => {
    const created = await createClient(admin.cookie, `${MARK} update`);
    const res = await request(http())
      .patch(`/clients/${created.id}`)
      .set('Cookie', admin.cookie)
      .send({ name: { ar: 'محدث', en: `${MARK} updated` }, status: 'inactive' })
      .expect(200);
    const body = res.body as ClientBody;
    expect(body.name.en).toBe(`${MARK} updated`);
    expect(body.status).toBe('inactive');
  });

  it('DELETE archives (soft): status → inactive', async () => {
    const created = await createClient(admin.cookie, `${MARK} archive`);
    const res = await request(http())
      .delete(`/clients/${created.id}`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect((res.body as ClientBody).status).toBe('inactive');
    // The row still exists (soft archive, not hard delete).
    expect(await owner.client.count({ where: { id: created.id } })).toBe(1);
  });

  it('non-admin staff reads (200) but cannot create/update/delete (403)', async () => {
    await request(http()).get('/clients').set('Cookie', staff.cookie).expect(200);
    await request(http())
      .post('/clients')
      .set('Cookie', staff.cookie)
      .send({ name: { ar: 'x', en: 'y' } })
      .expect(403);
    const target = createdIds[0]!;
    await request(http())
      .patch(`/clients/${target}`)
      .set('Cookie', staff.cookie)
      .send({ status: 'active' })
      .expect(403);
    await request(http()).delete(`/clients/${target}`).set('Cookie', staff.cookie).expect(403);
  });

  it('client rep has no client.read → 403', async () => {
    await request(http()).get('/clients').set('Cookie', rep.cookie).expect(403);
  });

  it('404 for unknown id; 400 for invalid body', async () => {
    await request(http())
      .get('/clients/99999999-9999-4999-8999-999999999999')
      .set('Cookie', admin.cookie)
      .expect(404);
    await request(http())
      .post('/clients')
      .set('Cookie', admin.cookie)
      .send({ name: { ar: '', en: '' } })
      .expect(400);
  });

  it('mutations are audited (create + update + archive), scoped to the client', async () => {
    const created = await createClient(admin.cookie, `${MARK} audited`);
    // Update the NAME only (stays active) so the following DELETE truly archives.
    await request(http())
      .patch(`/clients/${created.id}`)
      .set('Cookie', admin.cookie)
      .send({ name: { ar: 'مدقّق', en: `${MARK} audited-2` } })
      .expect(200);
    await request(http()).delete(`/clients/${created.id}`).set('Cookie', admin.cookie).expect(200);

    const entries = await owner.auditEntry.findMany({
      where: { clientId: created.id, resource: 'client' },
      orderBy: { id: 'asc' },
    });
    expect(entries.map((e) => e.action)).toEqual(['create', 'update', 'archive']);
    expect(entries.every((e) => e.actorId === admin.userId && e.actorRole === 'company_admin')).toBe(
      true,
    );
    // before/after captured on the update.
    expect(entries[1]?.after).toMatchObject({ nameEn: `${MARK} audited-2` });
  });
});
