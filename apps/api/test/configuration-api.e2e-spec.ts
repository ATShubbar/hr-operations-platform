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

// CONF-01: the Configuration API — settings catalog + system-level resolution +
// system write. config.read is all staff; config.write is System Admin only
// (admin → MFA-required, so the writer logs in via loginAsEnrolledStaff).

interface Effective {
  settings: Record<string, unknown>;
}
interface Catalog {
  settings: Array<{ key: string; levels: string[]; default: unknown; description: string }>;
}

describe('Configuration API (CONF-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let staff: TestPrincipal; // hr_officer — config.read, NOT config.write
  let admin: TestPrincipal; // system_admin — config.write (enrolled → full session)

  const http = () => app.getHttpServer();

  async function resetStore() {
    await owner.systemSetting.deleteMany({});
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
    staff = await loginAsStaff(app, 'hr_officer');
    admin = await loginAsEnrolledStaff(app, 'system_admin');
  });

  afterAll(async () => {
    await resetStore();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  // ---- reads ----

  it('staff reads EFFECTIVE settings → catalog defaults', async () => {
    const body = (await request(http()).get('/config').set('Cookie', staff.cookie).expect(200))
      .body as Effective;
    expect(body.settings['calendar.display']).toBe('dual');
    expect(body.settings['timezone']).toBe('Asia/Riyadh');
    expect(body.settings['working.week']).toEqual([0, 1, 2, 3, 4]);
    expect(body.settings['ui.languages']).toEqual(['ar', 'en']);
    expect(body.settings['ui.language']).toBe('ar');
  });

  it('staff reads the CATALOG (levels declared per setting)', async () => {
    const body = (
      await request(http()).get('/config/catalog').set('Cookie', staff.cookie).expect(200)
    ).body as Catalog;
    const cal = body.settings.find((s) => s.key === 'calendar.display');
    expect(cal?.levels).toEqual(['system', 'client']);
    const langs = body.settings.find((s) => s.key === 'ui.languages');
    expect(langs?.levels).toEqual(['system']); // system-only: no per-client/user override
  });

  it('unauthenticated → 401', async () => {
    await request(http()).get('/config').expect(401);
  });

  // ---- system write gating ----

  it('non-admin staff cannot write system settings → 403', async () => {
    await request(http())
      .patch('/config/system/timezone')
      .set('Cookie', staff.cookie)
      .send({ value: 'Europe/London' })
      .expect(403);
  });

  it('System Admin sets a system setting; effective value reflects it', async () => {
    const res = await request(http())
      .patch('/config/system/calendar.display')
      .set('Cookie', admin.cookie)
      .send({ value: 'hijri' })
      .expect(200);
    expect(res.body).toMatchObject({ key: 'calendar.display', level: 'system', value: 'hijri' });

    const eff = (await request(http()).get('/config').set('Cookie', staff.cookie).expect(200))
      .body as Effective;
    expect(eff.settings['calendar.display']).toBe('hijri');
  });

  it('validated against the catalog schema — array + IANA timezone accepted', async () => {
    await request(http())
      .patch('/config/system/working.week')
      .set('Cookie', admin.cookie)
      .send({ value: [0, 1, 2, 3] })
      .expect(200);
    await request(http())
      .patch('/config/system/timezone')
      .set('Cookie', admin.cookie)
      .send({ value: 'Europe/London' })
      .expect(200);
  });

  it('unknown setting key → 404 (not a silent fallback)', async () => {
    await request(http())
      .patch('/config/system/nope.notasetting')
      .set('Cookie', admin.cookie)
      .send({ value: 'x' })
      .expect(404);
  });

  it('invalid value for a known setting → 400', async () => {
    await request(http())
      .patch('/config/system/calendar.display')
      .set('Cookie', admin.cookie)
      .send({ value: 'martian' })
      .expect(400);
    await request(http())
      .patch('/config/system/timezone')
      .set('Cookie', admin.cookie)
      .send({ value: 'Not/AZone' })
      .expect(400);
  });

  it('system writes are audited (resource=config, action=system-set)', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'config' } });
    const actions = new Set(entries.map((e) => e.action));
    expect(actions.has('system-set')).toBe(true);
    // Settings are non-sensitive — the value IS recorded (unlike salary/govdata).
    const dump = JSON.stringify(entries.map((e) => e.after));
    expect(dump).toMatch(/calendar\.display/);
  });
});
