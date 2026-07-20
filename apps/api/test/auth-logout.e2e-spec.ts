import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { cleanupHelperUsers, loginAsStaff } from './helpers/login';

describe('Logout + revocation (AUTH-05, e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('logout kills the session: same cookie is worthless immediately', async () => {
    const staff = await loginAsStaff(app);

    // Cookie works…
    await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', staff.cookie)
      .expect(200);

    // …logout succeeds and clears the cookie…
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', staff.cookie)
      .expect(200);
    expect(res.body.loggedOut).toBe(true);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(setCookie.some((c) => c.startsWith('hr_session=;'))).toBe(true);

    // …and the SAME cookie is now rejected everywhere.
    await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', staff.cookie)
      .expect(401);

    // Double logout with the dead cookie: unauthenticated → 401.
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', staff.cookie)
      .expect(401);
  });

  it('logout without a session → 401', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(401);
  });
});
