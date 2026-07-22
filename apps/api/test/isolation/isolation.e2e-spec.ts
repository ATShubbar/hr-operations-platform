import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanupHelperUsers,
  loginAsClientRep,
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    repA = await loginAsClientRep(app, CLIENT_A);
    repB = await loginAsClientRep(app, CLIENT_B);

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
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'staff') continue;
      const [method, path] = route.split(' ') as [string, string];
      await request(app.getHttpServer())[method.toLowerCase() as 'get'](path).expect(401);
    }
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
