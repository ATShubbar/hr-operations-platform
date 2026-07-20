import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PasswordService,
  SESSION_COOKIE,
  SessionsService,
  UsersService,
} from '../src/modules/auth/public-api';

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'auth02-correct-horse-battery';

function sessionIdFrom(setCookie: string[] | undefined): string | null {
  const cookie = (setCookie ?? []).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? (cookie.split(';')[0]?.split('=')[1] ?? null) : null;
}

describe('Login + sessions (AUTH-02, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionsService;
  let staffUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    sessions = app.get(SessionsService);
    const users = app.get(UsersService);
    const passwords = app.get(PasswordService);

    await prisma.authUser.deleteMany({ where: { email: { startsWith: 'auth02-' } } });
    const hash = await passwords.hash(PASSWORD);
    const staff = await users.createStaffUser({ email: 'auth02-staff@example.com', passwordHash: hash });
    staffUserId = staff.id;
    await users.createClientRepUser({
      email: 'auth02-rep@example.com',
      passwordHash: hash,
      clientId: CLIENT_A,
    });
    const disabled = await users.createStaffUser({
      email: 'auth02-disabled@example.com',
      passwordHash: hash,
    });
    await prisma.authUser.update({ where: { id: disabled.id }, data: { status: 'disabled' } });
  });

  afterAll(async () => {
    await prisma.authUser.deleteMany({ where: { email: { startsWith: 'auth02-' } } });
    await app.close();
  });

  it('valid staff login: 200, httpOnly cookie, session in Redis', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auth02-staff@example.com', password: PASSWORD })
      .expect(200);

    expect(res.body.userId).toBe(staffUserId);
    expect(res.body.principalType).toBe('staff');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const sessionId = sessionIdFrom(setCookie);
    const session = await sessions.get(sessionId ?? '');
    expect(session?.userId).toBe(staffUserId);
    expect(session?.principalType).toBe('staff');
    expect(session?.clientId).toBeNull();
    await sessions.destroy(sessionId ?? '');
  });

  it('client-rep login carries the client binding in the session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auth02-rep@example.com', password: PASSWORD })
      .expect(200);
    const sessionId = sessionIdFrom(res.headers['set-cookie'] as unknown as string[]);
    const session = await sessions.get(sessionId ?? '');
    expect(session?.principalType).toBe('client_rep');
    expect(session?.clientId).toBe(CLIENT_A);
    await sessions.destroy(sessionId ?? '');
  });

  it('wrong password and unknown email return IDENTICAL 401s', async () => {
    const wrongPw = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auth02-staff@example.com', password: 'nope-nope-nope' })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auth02-ghost@example.com', password: 'nope-nope-nope' })
      .expect(401);
    expect(wrongPw.body.message).toBe(unknown.body.message);
    expect(wrongPw.headers['set-cookie']).toBeUndefined();
  });

  it('disabled user cannot log in', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auth02-disabled@example.com', password: PASSWORD })
      .expect(401);
  });

  it('malformed payload → 400, not 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
  });
});
