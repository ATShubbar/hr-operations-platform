import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { UAT_ORIGIN, mfaSwitchedOffForUat } from '../src/modules/auth/public-api';
import { cleanupHelperUsers, loginAsStaff } from './helpers/login';

// UAT-01 (owner decision): UAT signs in without an authenticator. The switch
// may ONLY take effect when the app is served from the UAT address, so the
// production deploy (app.peopleandgro.com) cannot turn MFA off even if the
// variable were copied into its config by mistake.
describe('UAT-only MFA switch', () => {
  it('is on only with UAT_DISABLE_MFA=true AND the UAT origin', () => {
    expect(mfaSwitchedOffForUat({})).toBe(false);
    expect(mfaSwitchedOffForUat({ UAT_DISABLE_MFA: 'true' })).toBe(false);
    expect(mfaSwitchedOffForUat({ APP_WEB_ORIGIN: UAT_ORIGIN })).toBe(false);
    expect(
      mfaSwitchedOffForUat({ UAT_DISABLE_MFA: 'true', APP_WEB_ORIGIN: 'https://app.peopleandgro.com' }),
    ).toBe(false);
    expect(mfaSwitchedOffForUat({ UAT_DISABLE_MFA: '1', APP_WEB_ORIGIN: UAT_ORIGIN })).toBe(false);
    expect(mfaSwitchedOffForUat({ UAT_DISABLE_MFA: 'true', APP_WEB_ORIGIN: UAT_ORIGIN })).toBe(true);
  });

  describe('sign-in', () => {
    let app: INestApplication;
    const saved = { flag: process.env.UAT_DISABLE_MFA, origin: process.env.APP_WEB_ORIGIN };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, '127.0.0.1');
    });

    afterEach(() => {
      process.env.UAT_DISABLE_MFA = saved.flag;
      process.env.APP_WEB_ORIGIN = saved.origin;
      if (saved.flag === undefined) delete process.env.UAT_DISABLE_MFA;
      if (saved.origin === undefined) delete process.env.APP_WEB_ORIGIN;
    });

    afterAll(async () => {
      await cleanupHelperUsers(app);
      await app.close();
    });

    const meStatus = async (cookie: string) =>
      (await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie)).status;

    it('an administrator still has to enrol when the switch is off (the default)', async () => {
      const admin = await loginAsStaff(app, 'administrator');
      expect(await meStatus(admin.cookie)).not.toBe(200);
    });

    it('an administrator signs straight in on UAT with the switch on', async () => {
      process.env.UAT_DISABLE_MFA = 'true';
      process.env.APP_WEB_ORIGIN = UAT_ORIGIN;
      const admin = await loginAsStaff(app, 'administrator');
      expect(await meStatus(admin.cookie)).toBe(200);
    });

    it('the switch is ignored anywhere but the UAT origin', async () => {
      process.env.UAT_DISABLE_MFA = 'true';
      process.env.APP_WEB_ORIGIN = 'https://app.peopleandgro.com';
      const admin = await loginAsStaff(app, 'administrator');
      expect(await meStatus(admin.cookie)).not.toBe(200);
    });
  });
});
