import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { requestContext } from '../../src/context/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ENDPOINT_REGISTRY } from './endpoint-registry';

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

// Test-only identity injection: sets clientId on the ALREADY-CREATED request
// context from an x-test-client-id header. Registered as a Nest module so it
// runs AFTER AppModule's context middleware. This module exists only in this
// spec — nothing like it ships in src/.
@Module({})
class TestIdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) => {
        const cid = req.header('x-test-client-id');
        const ctx = requestContext.get();
        if (cid && ctx) ctx.clientId = cid;
        next();
      })
      .forRoutes('*');
  }
}

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
  let staff: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestIdentityModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    staff = app.get(PrismaService);

    await staff.coreScopeCheck.deleteMany();
    await staff.coreScopeCheck.createMany({
      data: [
        { clientId: CLIENT_A, note: 'A-secret-1' },
        { clientId: CLIENT_A, note: 'A-secret-2' },
        { clientId: CLIENT_B, note: 'B-secret-1' },
      ],
    });
  });

  afterAll(async () => {
    await staff.coreScopeCheck.deleteMany();
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
        .set('x-test-client-id', CLIENT_A)
        .expect(200);
      const rows = res.body as Array<{ clientId: string; note: string }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.clientId === CLIENT_A)).toBe(true);
    });

    it(`${route}: wrong-client probe leaks NOTHING of client A`, async () => {
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
        .set('x-test-client-id', CLIENT_B)
        .expect(200);
      const rows = res.body as Array<{ clientId: string; note: string }>;
      expect(rows.some((r) => r.clientId === CLIENT_A)).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('A-secret');
    });

    it(`${route}: NO client identity -> 403, never data`, async () => {
      await request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
        .expect(403);
    });
  }

  it('public endpoints are reachable unauthenticated (never 401/403)', async () => {
    for (const [route, scope] of Object.entries(ENDPOINT_REGISTRY)) {
      if (scope !== 'public') continue;
      const [method, path] = route.split(' ') as [string, string];
      const res = await request(app.getHttpServer())[
        method.toLowerCase() as 'get' | 'post'
      ](path);
      // Public means the guard lets it through; a 400 (e.g. empty login
      // payload) is fine, an auth rejection is not.
      expect([401, 403]).not.toContain(res.status);
    }
  });
});
