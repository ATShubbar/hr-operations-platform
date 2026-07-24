import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { cleanupHelperUsers, loginAsClientRep, loginAsStaff, type TestPrincipal } from './helpers/login';

// GRO-02: the GRO processes API. Asymmetric dual-path — GRO officers manage
// processes across clients; client reps READ their OWN client's processes STATUS-
// ONLY (reference/notes/assignee redacted); Recruiter/Finance can't see GRO at all.

describe('GRO processes API (GRO-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let clientA: string;
  let clientB: string;
  let empA: string;
  let empB: string;
  let gro: TestPrincipal; // GRO officer — full process management
  let finance: TestPrincipal; // staff WITHOUT gro.read
  let repA: TestPrincipal; // client_admin of A (read own, status-only)
  let repB: TestPrincipal; // client_user of B
  let procA = '';
  let procB = '';

  const post = (cookie: string, body: object) =>
    request(http).post('/gro-processes').set('Cookie', cookie).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    const cA = await owner.client.create({
      data: { nameAr: 'شركة أ للجوازات', nameEn: 'GRO-02 Client A', status: 'active' },
    });
    const cB = await owner.client.create({
      data: { nameAr: 'شركة ب للجوازات', nameEn: 'GRO-02 Client B', status: 'active' },
    });
    clientA = cA.id;
    clientB = cB.id;
    const eA = await owner.employee.create({
      data: { clientId: clientA, nameAr: 'أ', nameEn: 'Emp A', nationality: 'SA', contractType: 'unlimited' },
    });
    const eB = await owner.employee.create({
      data: { clientId: clientB, nameAr: 'ب', nameEn: 'Emp B', nationality: 'IN', contractType: 'unlimited' },
    });
    empA = eA.id;
    empB = eB.id;
    gro = await loginAsStaff(app, 'gro_officer');
    finance = await loginAsStaff(app, 'finance');
    repA = await loginAsClientRep(app, clientA, 'client_admin');
    repB = await loginAsClientRep(app, clientB, 'client_user');
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.groProcess.deleteMany({ where: { clientId: { in: [clientA, clientB] } } });
    await owner.employee.deleteMany({ where: { id: { in: [empA, empB] } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: [clientA, clientB] } } });
    await owner.$disconnect();
    await app.close();
  });

  it('GRO officer creates processes — clientId derived from the employee', async () => {
    const a = await post(gro.cookie, {
      employeeId: empA,
      type: 'iqama_renewal',
      referenceNumber: 'MUQ-A-1',
      notes: 'internal note',
    }).expect(201);
    expect(a.body.clientId).toBe(clientA); // derived from the employee
    expect(a.body.status).toBe('not_started');
    expect(a.body.referenceNumber).toBe('MUQ-A-1');
    procA = a.body.id;

    const b = await post(gro.cookie, { employeeId: empB, type: 'exit_reentry' }).expect(201);
    procB = b.body.id;
  });

  it('rejects create for an unknown employee (404)', async () => {
    await post(gro.cookie, {
      employeeId: '00000000-0000-4000-8000-000000000000',
      type: 'other',
    }).expect(404);
  });

  it('advances status along the workflow; rejects an illegal transition', async () => {
    await request(http).post(`/gro-processes/${procA}/status`).set('Cookie', gro.cookie).send({ status: 'in_progress' }).expect(200);
    // in_progress → approved skips 'submitted' → illegal (400)
    await request(http).post(`/gro-processes/${procA}/status`).set('Cookie', gro.cookie).send({ status: 'approved' }).expect(400);
    const submitted = await request(http).post(`/gro-processes/${procA}/status`).set('Cookie', gro.cookie).send({ status: 'submitted' }).expect(200);
    expect(submitted.body.status).toBe('submitted');
  });

  it('a client rep reads ONLY their own processes, STATUS-ONLY (reference/notes/assignee redacted)', async () => {
    const a = await request(http).get('/gro-processes').set('Cookie', repA.cookie).expect(200);
    const ids = a.body.processes.map((p: { id: string }) => p.id);
    expect(ids).toContain(procA);
    expect(ids).not.toContain(procB);
    const row = a.body.processes.find((p: { id: string }) => p.id === procA);
    // status-only: type/status/dueDate visible…
    expect(row.type).toBe('iqama_renewal');
    expect(row.status).toBe('submitted');
    // …reference/notes/assignee redacted to null
    expect(row.referenceNumber).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.assigneeUserId).toBeNull();

    // rep A cannot fetch client B's process by id → 404 (RLS hides it)
    await request(http).get(`/gro-processes/${procB}`).set('Cookie', repA.cookie).expect(404);
    // rep B sees their own
    const b = await request(http).get('/gro-processes').set('Cookie', repB.cookie).expect(200);
    expect(b.body.processes.map((p: { id: string }) => p.id)).toEqual([procB]);
  });

  it('a client rep cannot write processes (403)', async () => {
    await post(repA.cookie, { employeeId: empA, type: 'other' }).expect(403);
    await request(http).patch(`/gro-processes/${procA}`).set('Cookie', repA.cookie).send({ notes: 'x' }).expect(403);
    await request(http).post(`/gro-processes/${procA}/status`).set('Cookie', repA.cookie).send({ status: 'cancelled' }).expect(403);
  });

  it('Finance staff cannot read GRO (403 — gro.read not granted)', async () => {
    await request(http).get('/gro-processes').set('Cookie', finance.cookie).expect(403);
  });

  it('rejects unauthenticated callers (401)', async () => {
    await request(http).get('/gro-processes').expect(401);
  });
});
