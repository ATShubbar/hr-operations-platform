import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmployeeHistoryResponse, RequestListResponse, RequestResponse } from '@hr/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// DS-08's two API additions:
//   1. request responses name their REQUESTER — name + kind, never the email —
//      on the staff and the client-rep paths;
//   2. request writes record their id (AUDIT-06's column) and
//      GET /requests/:id/history serves the request's curated decision trail.

const MARK = 'ds08-';

describe('Requests — requester and decision trail (DS-08, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hr: TestPrincipal;
  let rep: TestPrincipal;
  let clientId: string;
  let employeeId: string;
  let staffReq: string;
  let repReq: string;
  let empReq: string;

  const http = () => app.getHttpServer();
  const get = (path: string, cookie: string) => request(http()).get(path).set('Cookie', cookie);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    clientId = (await prisma.client.create({ data: { nameAr: 'شركة طلبات', nameEn: `${MARK}Co` } }))
      .id;
    await prisma.clientSetting.create({
      data: { clientId, key: 'flag.employee-self-service', value: true },
    });
    employeeId = (
      await prisma.employee.create({
        data: {
          clientId,
          nameAr: 'موظف',
          nameEn: `${MARK}employee`,
          nationality: 'EG',
          contractType: 'unlimited',
        },
      })
    ).id;
    hr = await loginAsStaff(app, 'hr_officer');
    rep = await loginAsClientRep(app, clientId, 'client_manager');
    const employee = await loginAsEmployee(app, employeeId);
    // A display name, so the requester's NAME is asserted, not just its kind.
    await prisma.authUser.update({
      where: { id: rep.userId },
      data: { displayName: 'Rep Person' },
    });

    staffReq = (
      await request(http())
        .post('/requests')
        .set('Cookie', hr.cookie)
        .send({ clientId, type: 'letter', title: `${MARK}staff` })
        .expect(201)
    ).body.id;
    repReq = (
      await request(http())
        .post('/requests')
        .set('Cookie', rep.cookie)
        .send({ type: 'certificate', title: `${MARK}rep` })
        .expect(201)
    ).body.id;
    empReq = (
      await request(http())
        .post('/me/requests')
        .set('Cookie', employee.cookie)
        .send({ type: 'certificate', title: `${MARK}employee` })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { requestId: { in: [staffReq, repReq, empReq] } } });
    await prisma.request.deleteMany({ where: { clientId } });
    await cleanupHelperUsers(app);
    await prisma.employee.deleteMany({ where: { id: employeeId } });
    await prisma.clientSetting.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await app.close();
  });

  it('each request names its requester by kind (and name), never email — staff path', async () => {
    const list = (await get(`/requests?clientId=${clientId}`, hr.cookie).expect(200))
      .body as RequestListResponse;
    const by = Object.fromEntries(list.requests.map((r) => [r.id, r.requester]));
    expect(by[staffReq]?.kind).toBe('staff');
    expect(by[repReq]).toEqual({ name: 'Rep Person', kind: 'client' });
    expect(by[empReq]?.kind).toBe('employee');
    for (const r of list.requests) {
      expect(Object.keys(r.requester ?? {}).sort()).toEqual(['kind', 'name']);
    }
    expect(JSON.stringify(list)).not.toMatch(/@example\.com/);
    const one = (await get(`/requests/${repReq}`, hr.cookie).expect(200)).body as RequestResponse;
    expect(one.requester).toEqual({ name: 'Rep Person', kind: 'client' });
  });

  it('the client-rep path names requesters too', async () => {
    const list = (await get('/requests', rep.cookie).expect(200)).body as RequestListResponse;
    const mine = list.requests.find((r) => r.id === repReq);
    expect(mine?.requester).toEqual({ name: 'Rep Person', kind: 'client' });
  });

  it('the decision trail records processing, newest first, without snapshots', async () => {
    await request(http())
      .post(`/requests/${staffReq}/process`)
      .set('Cookie', hr.cookie)
      .send({ status: 'in_progress', assigneeUserId: hr.userId })
      .expect(200);
    await request(http())
      .post(`/requests/${staffReq}/process`)
      .set('Cookie', hr.cookie)
      .send({ status: 'cancelled' })
      .expect(200);
    const trail = (await get(`/requests/${staffReq}/history`, hr.cookie).expect(200))
      .body as EmployeeHistoryResponse;
    expect(trail.entries.map((e) => e.action)).toEqual(['process', 'process', 'create']);
    expect(trail.entries.every((e) => e.resource === 'request')).toBe(true);
    expect(trail.entries[0]?.actor?.role).toBe('hr_officer');
    for (const e of trail.entries) {
      expect(Object.keys(e).sort()).toEqual(['action', 'actor', 'at', 'id', 'resource', 'subject']);
    }
    expect(JSON.stringify(trail)).not.toMatch(/"before"|"after"|cancelled|in_progress/);
    // Another request's trail holds only its own entries.
    const other = (await get(`/requests/${repReq}/history`, hr.cookie).expect(200))
      .body as EmployeeHistoryResponse;
    expect(other.entries.map((e) => e.action)).toEqual(['create']);
  });

  it('the trail is staff-only; unknown/malformed ids 404; unauth 401', async () => {
    await get(`/requests/${repReq}/history`, rep.cookie).expect(403);
    const emp = await loginAsEmployee(app, randomUUID());
    await get(`/requests/${repReq}/history`, emp.cookie).expect(403);
    await get(`/requests/${randomUUID()}/history`, hr.cookie).expect(404);
    await get('/requests/nope/history', hr.cookie).expect(404);
    await request(http()).get(`/requests/${repReq}/history`).expect(401);
  });
});
