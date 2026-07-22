import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { ConfigService } from '../src/modules/configuration/public-api';
import {
  cleanupHelperUsers,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// CONF-04: feature flags. A flag is a boolean setting under the `flag.`
// namespace — it rides the SAME substrate, so it is toggled through the
// existing system/per-client PATCH endpoints and resolves through the same
// client → system machinery. ConfigService.isEnabled() is the read sugar other
// modules use.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const EXPIRY = 'flag.document-expiry-alerts';
const SELF_SERVICE = 'flag.client-self-service';

interface Flags {
  flags: Record<string, boolean>;
}

describe('Configuration feature flags (CONF-04, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let config: ConfigService;
  let systemAdmin: TestPrincipal; // config.write (system flag)
  let companyAdmin: TestPrincipal; // config.write-client (per-client flag)
  let staff: TestPrincipal; // config.read (read flags)

  const http = () => app.getHttpServer();

  async function resetStore() {
    await owner.systemSetting.deleteMany({});
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
    config = app.get(ConfigService);
    await resetStore();
    systemAdmin = await loginAsEnrolledStaff(app, 'system_admin');
    companyAdmin = await loginAsEnrolledStaff(app, 'company_admin');
    staff = await loginAsStaff(app, 'hr_officer');
  });

  afterAll(async () => {
    await resetStore();
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('GET /config/flags lists the flags, defaulting to false', async () => {
    const body = (await request(http()).get('/config/flags').set('Cookie', staff.cookie).expect(200))
      .body as Flags;
    expect(body.flags[EXPIRY]).toBe(false);
    expect(body.flags[SELF_SERVICE]).toBe(false);
  });

  it('a flag toggles through the EXISTING system endpoint (rides the substrate)', async () => {
    const res = await request(http())
      .patch(`/config/system/${EXPIRY}`)
      .set('Cookie', systemAdmin.cookie)
      .send({ value: true })
      .expect(200);
    expect(res.body).toMatchObject({ key: EXPIRY, level: 'system', value: true });

    const body = (await request(http()).get('/config/flags').set('Cookie', staff.cookie).expect(200))
      .body as Flags;
    expect(body.flags[EXPIRY]).toBe(true);
    // isEnabled() (what other modules call) agrees
    expect(await config.isEnabled(EXPIRY)).toBe(true);
  });

  it('a flag value must be boolean → 400', async () => {
    await request(http())
      .patch(`/config/system/${EXPIRY}`)
      .set('Cookie', systemAdmin.cookie)
      .send({ value: 'yes' })
      .expect(400);
  });

  it('per-client flag override resolves per client (client → system)', async () => {
    // system default is false; enable self-service for client A only.
    await request(http())
      .patch(`/config/client/${CLIENT_A}/${SELF_SERVICE}`)
      .set('Cookie', companyAdmin.cookie)
      .send({ value: true })
      .expect(200);

    expect(await config.isEnabled(SELF_SERVICE, { clientId: CLIENT_A })).toBe(true); // client override
    expect(await config.isEnabled(SELF_SERVICE, { clientId: CLIENT_B })).toBe(false); // isolated
    expect(await config.isEnabled(SELF_SERVICE)).toBe(false); // system default
  });

  it('isEnabled rejects a non-flag key (a bug, not a false)', async () => {
    await expect(config.isEnabled('calendar.display')).rejects.toThrow();
  });

  it('flag toggles are audited on the config resource', async () => {
    const entries = await owner.auditEntry.findMany({ where: { resource: 'config' } });
    const dump = JSON.stringify(entries.map((e) => e.after));
    expect(dump).toMatch(/flag\.document-expiry-alerts/);
    expect(dump).toMatch(/flag\.client-self-service/);
  });
});
