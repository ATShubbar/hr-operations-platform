import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// CONF-02: per-client setting overrides. Managed by Company Admin (config.
// write-client, an admin role → MFA-required, so enrolled login). Precedence
// client → system, per-client-isolated. Uses the two seed clients.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

interface Effective {
  settings: Record<string, unknown>;
}

describe('Configuration per-client overrides (CONF-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let companyAdmin: TestPrincipal; // config.write-client
  let hr: TestPrincipal; // config.read, NOT config.write-client

  const http = () => app.getHttpServer();

  async function resetStore() {
    await owner.clientSetting.deleteMany({});
    await owner.auditEntry.deleteMany({ where: { resource: 'config' } });
  }

  const clientEffective = (cookie: string, clientId: string) =>
    request(http()).get(`/config/client/${clientId}`).set('Cookie', cookie);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await resetStore();
    companyAdmin = await loginAsEnrolledStaff(app, 'company_admin');
    hr = await loginAsStaff(app, 'hr_officer');
  });

  afterAll(async () => {
    await resetStore();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('no overrides → client effective equals system defaults', async () => {
    const body = (await clientEffective(hr.cookie, CLIENT_A).expect(200)).body as Effective;
    expect(body.settings['calendar.display']).toBe('dual');
    expect(body.settings['timezone']).toBe('Asia/Riyadh');
  });

  it('Company Admin sets a per-client override; client effective reflects it, system unchanged', async () => {
    const res = await request(http())
      .patch(`/config/client/${CLIENT_A}/calendar.display`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: 'hijri' })
      .expect(200);
    expect(res.body).toMatchObject({ key: 'calendar.display', level: 'client', value: 'hijri' });

    // client A now hijri…
    const a = (await clientEffective(hr.cookie, CLIENT_A).expect(200)).body as Effective;
    expect(a.settings['calendar.display']).toBe('hijri');
    // …but the SYSTEM effective is still the default (override didn't leak up).
    const sys = (await request(http()).get('/config').set('Cookie', hr.cookie).expect(200))
      .body as Effective;
    expect(sys.settings['calendar.display']).toBe('dual');
  });

  it('overrides are per-client — client B is unaffected by client A', async () => {
    const b = (await clientEffective(hr.cookie, CLIENT_B).expect(200)).body as Effective;
    expect(b.settings['calendar.display']).toBe('dual');
  });

  it('a setting with no client level → 400 (not a silent fallback)', async () => {
    // ui.language declares levels [system, user] — no client level.
    await request(http())
      .patch(`/config/client/${CLIENT_A}/ui.language`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: 'en' })
      .expect(400);
  });

  it('invalid value → 400; unknown key → 404; unknown client → 404', async () => {
    await request(http())
      .patch(`/config/client/${CLIENT_A}/timezone`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: 'Not/AZone' })
      .expect(400);
    await request(http())
      .patch(`/config/client/${CLIENT_A}/nope.notasetting`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: 'x' })
      .expect(404);
    await request(http())
      .patch(`/config/client/33333333-3333-4333-8333-333333333333/calendar.display`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: 'hijri' })
      .expect(404);
  });

  it('non-admin staff cannot write per-client overrides → 403', async () => {
    await request(http())
      .patch(`/config/client/${CLIENT_A}/timezone`)
      .set('Cookie', hr.cookie)
      .send({ value: 'Europe/London' })
      .expect(403);
  });

  it('clearing an override reverts the client to the system value', async () => {
    // set, confirm, clear, confirm reverted
    await request(http())
      .patch(`/config/client/${CLIENT_B}/timezone`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: 'Europe/London' })
      .expect(200);
    let b = (await clientEffective(hr.cookie, CLIENT_B).expect(200)).body as Effective;
    expect(b.settings['timezone']).toBe('Europe/London');

    const del = await request(http())
      .delete(`/config/client/${CLIENT_B}/timezone`)
      .set('Cookie', companyAdmin.cookie)
      .expect(200);
    expect(del.body).toMatchObject({ key: 'timezone', level: 'system', value: 'Asia/Riyadh' });
    b = (await clientEffective(hr.cookie, CLIENT_B).expect(200)).body as Effective;
    expect(b.settings['timezone']).toBe('Asia/Riyadh');
  });

  it('per-client writes are audited, scoped to the client (set + clear)', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'config' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('client-set')).toBe(true);
    expect(actions.has('client-clear')).toBe(true);
    // every per-client entry carries the affected client's id
    const clientScoped = entries.filter((e) => e.action.startsWith('client-'));
    expect(clientScoped.every((e) => e.clientId === CLIENT_A || e.clientId === CLIENT_B)).toBe(true);
  });
});
