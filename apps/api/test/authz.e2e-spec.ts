import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { cleanupHelperUsers, loginAsStaff, type TestPrincipal } from './helpers/login';

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
  let staff: TestPrincipal;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ForgotGuardModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    staff = await loginAsStaff(app);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('rejects an endpoint with NO permission metadata (403, even authenticated)', async () => {
    const res = await request(app.getHttpServer())
      .get('/forgot-guard')
      .set('Cookie', staff.cookie)
      .expect(403);
    expect(res.body.message).toContain('no declared permission');
  });

  it('rejects UNAUTHENTICATED requests to declared endpoints (401, AUTH-03)', async () => {
    await request(app.getHttpServer()).get('/example/greeting').expect(401);
    await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', 'hr_session=garbage-session-id')
      .expect(401);
  });

  it('allows authenticated requests to endpoints with @RequirePermission metadata', async () => {
    await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', staff.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/example-consumer/relay')
      .set('Cookie', staff.cookie)
      .expect(200);
  });

  it('allows @Public() health endpoints without metadata or session', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/ready').expect(200);
  });
});
