import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { MfaService } from '../src/modules/auth/public-api';
import { cleanupHelperUsers, loginAsStaff } from './helpers/login';

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const setCookie = (res.headers['set-cookie'] as string[]) ?? [];
  const c = setCookie.find((x) => x.startsWith('hr_session=')) ?? '';
  return c.split(';')[0] ?? '';
}

function secretFromUri(uri: string): string {
  return new URL(uri).searchParams.get('secret') ?? '';
}

describe('MFA / TOTP (AUTH-06, e2e)', () => {
  let app: INestApplication;
  let mfa: MfaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    mfa = app.get(MfaService);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  it('full lifecycle: opt-in enroll → verify → re-login requires challenge', async () => {
    const staff = await loginAsStaff(app); // hr_officer, MFA optional
    const http = app.getHttpServer();

    // Enroll: get provisioning URI, extract the shared secret.
    const enroll = await request(http)
      .post('/auth/mfa/enroll')
      .set('Cookie', staff.cookie)
      .expect(200);
    expect(enroll.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const secret = secretFromUri(enroll.body.otpauthUri);
    expect(secret.length).toBeGreaterThan(10);

    // Verify with a REAL generated code → enrollment active.
    await request(http)
      .post('/auth/mfa/verify')
      .set('Cookie', staff.cookie)
      .send({ code: mfa.generateCode(secret) })
      .expect(200);

    // Fresh login now yields a LIMITED challenge session.
    const relogin = await request(http)
      .post('/auth/login')
      .send({ email: staff.email, password: 'e2e-helper-password-1' })
      .expect(200);
    expect(relogin.body.mfaRequired).toBe(true);
    const pendingCookie = cookieOf(relogin);

    // Limited session is unauthenticated everywhere…
    await request(http).get('/example/greeting').set('Cookie', pendingCookie).expect(401);

    // …wrong code is rejected…
    await request(http)
      .post('/auth/mfa/challenge')
      .set('Cookie', pendingCookie)
      .send({ code: '000000' })
      .expect(401);

    // …valid code upgrades to a full session.
    const challenged = await request(http)
      .post('/auth/mfa/challenge')
      .set('Cookie', pendingCookie)
      .send({ code: mfa.generateCode(secret) })
      .expect(200);
    const fullCookie = cookieOf(challenged);
    await request(http).get('/example/greeting').set('Cookie', fullCookie).expect(200);
  });

  it('admin without MFA gets a limited session and MUST enroll (ADR-002)', async () => {
    // The helper logs in after creating the user — for an admin that login
    // itself returns the limited enroll_required session.
    const admin = await loginAsStaff(app, 'company_admin');
    const http = app.getHttpServer();

    // Limited: no access to normal endpoints…
    await request(http).get('/example/greeting').set('Cookie', admin.cookie).expect(401);

    // …but CAN enroll + verify…
    const enroll = await request(http)
      .post('/auth/mfa/enroll')
      .set('Cookie', admin.cookie)
      .expect(200);
    const secret = secretFromUri(enroll.body.otpauthUri);
    const verified = await request(http)
      .post('/auth/mfa/verify')
      .set('Cookie', admin.cookie)
      .send({ code: mfa.generateCode(secret) })
      .expect(200);
    expect(verified.body.enrolled).toBe(true);

    // …after which the (new) session is full: admin has example.read.
    const fullCookie = cookieOf(verified);
    await request(http).get('/example/greeting').set('Cookie', fullCookie).expect(200);
  });

  it('non-admin without enrollment logs in fully — behavior unchanged', async () => {
    const staff = await loginAsStaff(app, 'recruiter');
    await request(app.getHttpServer())
      .get('/example/greeting')
      .set('Cookie', staff.cookie)
      .expect(200);
  });

  it('double-enroll is rejected once active', async () => {
    const staff = await loginAsStaff(app);
    const http = app.getHttpServer();
    const enroll = await request(http)
      .post('/auth/mfa/enroll')
      .set('Cookie', staff.cookie)
      .expect(200);
    const secret = secretFromUri(enroll.body.otpauthUri);
    const verified = await request(http)
      .post('/auth/mfa/verify')
      .set('Cookie', staff.cookie)
      .send({ code: mfa.generateCode(secret) })
      .expect(200);
    await request(http)
      .post('/auth/mfa/enroll')
      .set('Cookie', cookieOf(verified))
      .expect(400);
  });
});
