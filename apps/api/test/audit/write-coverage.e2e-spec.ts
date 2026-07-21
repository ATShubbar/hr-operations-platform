import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AUDITED_WRITES, AUDIT_EXEMPT_WRITES } from './audited-writes';

// AUDIT-03: enforce that every mutating route is classified as audited or
// explicitly exempt — the CI "can't-forget" guarantee that justifies the
// explicit-at-site logging mechanism. A new write route that nobody declared
// (and therefore probably nobody audited) turns this red.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

describe('Write-audit coverage — every mutation is audited or exempt (AUDIT-03, e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('COVERAGE: every mutating route is classified; no stale or double entries', () => {
    const live = liveRoutes(app)
      .filter((r) => MUTATING.has(r.method))
      .map((r) => `${r.method} ${r.path}`);
    const audited = Object.keys(AUDITED_WRITES);
    const exempt = Object.keys(AUDIT_EXEMPT_WRITES);
    const classified = new Set([...audited, ...exempt]);

    const unclassified = live.filter((r) => !classified.has(r));
    const stale = [...classified].filter((r) => !live.includes(r));
    const doubled = audited.filter((r) => r in AUDIT_EXEMPT_WRITES);

    expect(
      unclassified,
      `Mutating routes not declared in audited-writes.ts (add as AUDITED_WRITES with its resource.action, or AUDIT_EXEMPT_WRITES with a reason): ${unclassified.join(', ')}`,
    ).toEqual([]);
    expect(stale, `Stale write-audit entries (route no longer exists): ${stale.join(', ')}`).toEqual(
      [],
    );
    expect(doubled, `Routes in BOTH audited and exempt: ${doubled.join(', ')}`).toEqual([]);
  });

  it('audited routes name a resource.action', () => {
    for (const [route, action] of Object.entries(AUDITED_WRITES)) {
      expect(action, route).toMatch(/^[a-z-]+\.[a-z-]+$/);
    }
  });

  it('exemptions carry a stated reason', () => {
    for (const [route, reason] of Object.entries(AUDIT_EXEMPT_WRITES)) {
      expect(reason.length, route).toBeGreaterThan(10);
    }
  });
});
