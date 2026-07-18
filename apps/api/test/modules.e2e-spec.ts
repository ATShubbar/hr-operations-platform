import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('Module skeleton (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /example/greeting serves the module capability', async () => {
    const res = await request(app.getHttpServer()).get('/example/greeting').expect(200);
    expect(res.body.greeting.en).toContain('Welcome');
    expect(res.body.greeting.ar).toBeTruthy();
  });

  it('GET /example-consumer/relay consumes example via its public API', async () => {
    const res = await request(app.getHttpServer()).get('/example-consumer/relay').expect(200);
    expect(res.body.relayedFrom).toBe('example');
    expect(res.body.greeting.en).toContain('Welcome');
  });
});
