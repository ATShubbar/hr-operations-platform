import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

// A controller that "forgot" its permission metadata — the deny-by-default
// proof required by ACTION-PLAN DoD 1.3. It must be unreachable.
@Controller('forgot-guard')
class ForgotGuardController {
  @Get()
  leak(): { secret: string } {
    return { secret: 'should never be reachable' };
  }
}

@Module({ controllers: [ForgotGuardController] })
class ForgotGuardModule {}

describe('Deny-by-default authorization guard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ForgotGuardModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an endpoint with NO permission metadata (403)', async () => {
    const res = await request(app.getHttpServer()).get('/forgot-guard').expect(403);
    expect(res.body.message).toContain('no declared permission');
  });

  it('allows endpoints with @RequirePermission metadata', async () => {
    await request(app.getHttpServer()).get('/example/greeting').expect(200);
    await request(app.getHttpServer()).get('/example-consumer/relay').expect(200);
  });

  it('allows @Public() health endpoints without metadata', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/ready').expect(200);
  });
});
