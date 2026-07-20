import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

describe('Module skeleton (e2e)', () => {
  let app: INestApplication;
  let staff: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    staff = await loginAsStaff(app);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('GET /example/greeting serves the module capability', async () => {
    const res = await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', staff.cookie)
      .expect(200);
    expect(res.body.greeting.en).toContain('Welcome');
    expect(res.body.greeting.ar).toBeTruthy();
  });

  it('GET /example-consumer/relay consumes example via its public API', async () => {
    const res = await request(app.getHttpServer())
      .get('/example-consumer/relay')
      .set('Cookie', staff.cookie)
      .expect(200);
    expect(res.body.relayedFrom).toBe('example');
    expect(res.body.greeting.en).toContain('Welcome');
  });
});
