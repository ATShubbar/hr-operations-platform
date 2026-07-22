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
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// CONF-03: per-user preferences + full user → client → system resolution. Any
// authenticated principal manages their OWN prefs via /config/me; actor comes
// from the session, never the URL. A client-rep caller exercises all three
// tiers (a seeded per-client override + a per-user override over the system
// default); a staff caller has no client tier.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';

interface Effective {
  settings: Record<string, unknown>;
}

describe('Configuration per-user preferences (CONF-03, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let staffA: TestPrincipal;
  let staffB: TestPrincipal;
  let rep: TestPrincipal; // client_admin of CLIENT_A — has a client tier

  const http = () => app.getHttpServer();
  const me = (cookie: string) => request(http()).get('/config/me').set('Cookie', cookie);

  async function resetStore() {
    await owner.userSetting.deleteMany({});
    await owner.clientSetting.deleteMany({});
    await owner.auditEntry.deleteMany({ where: { resource: 'config' } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await resetStore();
    // A per-client override for CLIENT_A so the rep's resolution has a client tier.
    await owner.clientSetting.create({
      data: { clientId: CLIENT_A, key: 'calendar.display', value: 'gregorian' },
    });
    staffA = await loginAsStaff(app, 'recruiter');
    staffB = await loginAsStaff(app, 'read_only');
    rep = await loginAsClientRep(app, CLIENT_A, 'client_admin');
  });

  afterAll(async () => {
    await resetStore();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  // ---- staff caller: user → system (no client tier) ----

  it('staff /config/me starts at system defaults', async () => {
    const body = (await me(staffA.cookie).expect(200)).body as Effective;
    expect(body.settings['ui.language']).toBe('ar');
    expect(body.settings['calendar.display']).toBe('dual'); // staff has no client override
  });

  it('staff sets a per-user preference; /config/me reflects it, then clears back', async () => {
    const set = await request(http())
      .patch('/config/me/ui.language')
      .set('Cookie', staffA.cookie)
      .send({ value: 'en' })
      .expect(200);
    expect(set.body).toMatchObject({ key: 'ui.language', level: 'user', value: 'en' });
    expect(((await me(staffA.cookie).expect(200)).body as Effective).settings['ui.language']).toBe(
      'en',
    );

    const clear = await request(http())
      .delete('/config/me/ui.language')
      .set('Cookie', staffA.cookie)
      .expect(200);
    expect(clear.body).toMatchObject({ key: 'ui.language', level: 'system', value: 'ar' });
    expect(((await me(staffA.cookie).expect(200)).body as Effective).settings['ui.language']).toBe(
      'ar',
    );
  });

  it('a setting with no user level → 400; invalid value → 400; unknown key → 404', async () => {
    await request(http())
      .patch('/config/me/calendar.display') // levels [system, client] — no user
      .set('Cookie', staffA.cookie)
      .send({ value: 'hijri' })
      .expect(400);
    await request(http())
      .patch('/config/me/ui.language')
      .set('Cookie', staffA.cookie)
      .send({ value: 'fr' })
      .expect(400);
    await request(http())
      .patch('/config/me/nope.notasetting')
      .set('Cookie', staffA.cookie)
      .send({ value: 'x' })
      .expect(404);
  });

  it('preferences are per-user — one user does not affect another', async () => {
    await request(http())
      .patch('/config/me/ui.language')
      .set('Cookie', staffA.cookie)
      .send({ value: 'en' })
      .expect(200);
    // staffB is untouched
    expect(((await me(staffB.cookie).expect(200)).body as Effective).settings['ui.language']).toBe(
      'ar',
    );
    await request(http()).delete('/config/me/ui.language').set('Cookie', staffA.cookie).expect(200);
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/config/me').expect(401);
  });

  // ---- client-rep caller: user → client → system (all three tiers) ----

  it('client-rep resolution composes user over client over system', async () => {
    // Before any user override: calendar.display = client override (gregorian),
    // ui.language = system default (ar).
    let body = (await me(rep.cookie).expect(200)).body as Effective;
    expect(body.settings['calendar.display']).toBe('gregorian'); // client tier
    expect(body.settings['ui.language']).toBe('ar'); // system tier

    // Add a user override on ui.language → user tier wins; client override stays.
    await request(http())
      .patch('/config/me/ui.language')
      .set('Cookie', rep.cookie)
      .send({ value: 'en' })
      .expect(200);
    body = (await me(rep.cookie).expect(200)).body as Effective;
    expect(body.settings['calendar.display']).toBe('gregorian'); // still client
    expect(body.settings['ui.language']).toBe('en'); // now user
  });

  it('per-user writes are audited, carrying the actor id', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'config' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('user-set')).toBe(true);
    expect(actions.has('user-clear')).toBe(true);
    const userEntries = entries.filter((e) => e.action.startsWith('user-'));
    expect(userEntries.every((e) => e.actorId !== null)).toBe(true);
    // staffA's set is attributed to staffA
    expect(userEntries.some((e) => e.actorId === staffA.userId)).toBe(true);
  });
});
