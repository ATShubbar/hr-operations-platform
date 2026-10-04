import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  type TestPrincipal,
} from '../helpers/login';
import { ENDPOINT_REGISTRY } from './endpoint-registry';

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

// AUTH-03: the harness now authenticates through REAL sessions — the former
// test-only identity middleware is retired. Client identity flows
// login → Redis session → session middleware → request context → RLS scope.

interface RouteInfo {
  method: string;
  path: string;
}

function liveRoutes(app: INestApplication): RouteInfo[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: unknown[] };
    _router?: { stack: unknown[] };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const routes: RouteInfo[] = [];
  for (const layer of stack as Array<{
    route?: { path: string; methods: Record<string, boolean> };
  }>) {
    if (!layer.route) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled) routes.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return routes;
}

describe('Cross-client isolation harness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repA: TestPrincipal;
  let repB: TestPrincipal;
  let employee: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    repA = await loginAsClientRep(app, CLIENT_A);
    repB = await loginAsClientRep(app, CLIENT_B);
    employee = await loginAsEmployee(app);

    await prisma.coreScopeCheck.deleteMany();
    await prisma.coreScopeCheck.createMany({
      data: [
        { clientId: CLIENT_A, note: 'A-secret-1' },
        { clientId: CLIENT_A, note: 'A-secret-2' },
        { clientId: CLIENT_B, note: 'B-secret-1' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.coreScopeCheck.deleteMany();
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('COVERAGE: every live route is registered, every registry entry is live', () => {
    const live = liveRoutes(app).map((r) => `${r.method} ${r.path}`);
    const registered = Object.keys(ENDPOINT_REGISTRY);

    const unregistered = live.filter((r) => !registered.includes(r));
    const stale = registered.filter((r) => !live.includes(r));

    expect(unregistered, `Unregistered routes (add to endpoint-registry.ts): ${unregistered.join(', ')}`).toEqual([]);
    expect(stale, `Stale registry entries (route no longer exists): ${stale.join(', ')}`).toEqual([]);
  });

  const clientScoped = Object.entries(ENDPOINT_REGISTRY).filter(
    ([, scope]) => scope === 'client-scoped',
  );

  for (const [route] of clientScoped) {
    const [method, path] = route.split(' ') as [string, string];

    it(`${route}: caller sees ONLY their own client's rows`, async () => {
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
        .set('Cookie', repA.cookie)
        .expect(200);
      const rows = res.body as Array<{ clientId: string; note: string }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.clientId === CLIENT_A)).toBe(true);
    });

    it(`${route}: wrong-client probe leaks NOTHING of client A`, async () => {
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
        .set('Cookie', repB.cookie)
        .expect(200);
      const rows = res.body as Array<{ clientId: string; note: string }>;
      expect(rows.some((r) => r.clientId === CLIENT_A)).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('A-secret');
    });

    it(`${route}: unauthenticated -> 401, never data`, async () => {
      await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
        .expect(401);
    });
  }

  it('staff-scoped endpoints reject unauthenticated requests (401)', async () => {
    // Collect every offender rather than stopping at the first: when this fails
    // the useful output is WHICH routes let an anonymous caller through.
    const notRejected: string[] = [];
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'staff') continue;
      const [method, path] = route.split(' ') as [string, string];
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path);
      if (res.status !== 401) notRejected.push(`${route} -> ${res.status}`);
    }
    expect(notRejected).toEqual([]);
  });

  it('client-read endpoints reject unauthenticated requests (401)', async () => {
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'client-read') continue;
      const [method, path] = route.split(' ') as [string, string];
      await request(app.getHttpServer())[method.toLowerCase() as 'get'](path).expect(401);
    }
  });

  it('client-write endpoints reject unauthenticated requests (401)', async () => {
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'client-write') continue;
      const [method, path] = route.split(' ') as [string, string];
      await request(app.getHttpServer())[method.toLowerCase() as 'post'](path)
        .send({ note: 'probe' })
        .expect(401);
    }
  });

  it('self-service endpoints reject unauthenticated requests (401)', async () => {
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'self') continue;
      const [method, path] = route.split(' ') as [string, string];
      await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'patch' | 'delete'](
        path,
      ).expect(401);
    }
  });

  // ---- Employee self-service (SS-02, ADR-011) ------------------------------

  // THE PRINCIPAL FENCE. An employee principal may reach public, session-flow
  // and own-identity routes and its own `employee` routes — nothing else, and
  // not because of any one permission: if a future catalog change hands the
  // employee role a permission a staff or client-rep endpoint checks (ADR-011
  // rev. 1 — `employee.read` would open GET /employees), this fails and names
  // the route.
  it('every route outside public / session / self / employee REFUSES an employee principal (403)', async () => {
    const reachable: string[] = [];
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (['public', 'session', 'self', 'employee', 'employee-read', 'employee-write'].includes(scope)) continue;
      const [method, path] = route.split(' ') as [string, string];
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
        .set('Cookie', employee.cookie)
        .send({});
      if (res.status !== 403) reachable.push(`${route} -> ${res.status}`);
    }
    expect(reachable).toEqual([]);
  });

  const employeeScoped = Object.entries(ENDPOINT_REGISTRY).filter(
    ([, scope]) => scope === 'employee',
  );

  if (employeeScoped.length === 0) {
    // Stated, not hidden: the class exists so SS-03's first self-service route
    // is probed the moment it is registered. Until then this proves nothing.
    it('employee-scoped routes: NONE registered yet (SS-03 adds the first)', () => {
      expect(employeeScoped).toEqual([]);
    });
  }

  describe.runIf(employeeScoped.length > 0)('employee-scoped routes', () => {
    // Two employees AT THE SAME COMPANY — the case the client boundary cannot
    // catch — at a company created here with employee self-service switched ON
    // (it is off by default). Its own company, not a seed client, so no other
    // spec's flag state can race this one.
    let me: TestPrincipal & { employeeId: string };
    let colleague: TestPrincipal & { employeeId: string };
    let companyId = '';
    const created: string[] = [];

    beforeAll(async () => {
      companyId = (
        await prisma.client.create({ data: { nameAr: 'شركة عزل', nameEn: 'ISO-employee Co.' } })
      ).id;
      await prisma.clientSetting.create({
        data: { clientId: companyId, key: 'flag.employee-self-service', value: true },
      });
      const mk = async (name: string) => {
        const row = await prisma.employee.create({
          data: { clientId: companyId, nameAr: 'اختبار', nameEn: `ISO-employee ${name}`, nationality: 'EG', contractType: 'unlimited' },
        });
        created.push(row.id);
        return row.id;
      };
      const meId = await mk('me');
      const colleagueId = await mk('colleague');
      // List-shaped employee routes (GET /me/documents) carry no employee id in
      // their rows, so each fixture document is TITLED with its owner's id: the
      // same "my id is in my response, not in my colleague's" assertion then
      // works for every route in the class.
      await prisma.document.createMany({
        data: [meId, colleagueId].map((owner) => ({
          clientId: companyId,
          employeeId: owner,
          category: 'iqama' as const,
          title: `ISO-doc ${owner}`,
          fileName: 'x.pdf',
          contentType: 'application/pdf',
          storageKey: `iso/${owner}`,
          status: 'available' as const,
        })),
      });
      // Likewise one request each, titled with its raiser's id (SS-05).
      await prisma.request.createMany({
        data: [meId, colleagueId].map((owner) => ({
          clientId: companyId,
          requesterEmployeeId: owner,
          type: 'general' as const,
          title: `ISO-request ${owner}`,
          createdByUserId: owner,
        })),
      });
      me = await loginAsEmployee(app, meId);
      colleague = await loginAsEmployee(app, colleagueId);
    });

    afterAll(async () => {
      await prisma.document.deleteMany({ where: { clientId: companyId } });
      await prisma.request.deleteMany({ where: { clientId: companyId } });
      await prisma.employee.deleteMany({ where: { id: { in: created } } });
      await prisma.clientSetting.deleteMany({ where: { clientId: companyId } });
      await prisma.client.delete({ where: { id: companyId } });
    });

    for (const [route] of employeeScoped) {
      const [method, path] = route.split(' ') as [string, string];

      it(`${route}: caller sees their OWN record`, async () => {
        const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
          .set('Cookie', me.cookie)
          .expect(200);
        expect(JSON.stringify(res.body)).toContain(me.employeeId);
      });

      it(`${route}: a same-company colleague sees NOTHING of it`, async () => {
        const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
          .set('Cookie', colleague.cookie);
        expect(JSON.stringify(res.body)).not.toContain(me.employeeId);
      });

      it(`${route}: unauthenticated -> 401`, async () => {
        await request(app.getHttpServer())[method.toLowerCase() as 'get'](path).expect(401);
      });
    }
  });

  it('employee-read and employee-write endpoints reject unauthenticated requests (401)', async () => {
    const notRejected: string[] = [];
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'employee-read' && scope !== 'employee-write') continue;
      const [method, path] = route.split(' ') as [string, string];
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path);
      if (res.status !== 401) notRejected.push(`${route} -> ${res.status}`);
    }
    expect(notRejected).toEqual([]);
  });

  it('session-flow endpoints self-reject unauthenticated requests (401)', async () => {
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'session') continue;
      const [method, path] = route.split(' ') as [string, string];
      await request(app.getHttpServer())[method.toLowerCase() as 'post'](path)
        .send({ code: '000000' })
        .expect(401);
    }
  });

  it('public endpoints are reachable unauthenticated (never 401/403)', async () => {
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'public') continue;
      const [method, path] = route.split(' ') as [string, string];
      const res = await request(app.getHttpServer())[
        method.toLowerCase() as 'get' | 'post'
      ](path);
      expect([401, 403]).not.toContain(res.status);
    }
  });
});
