import type { INestApplication } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { scopeOf } from '../src/auth/scope';
import { requestContext } from '../src/context/request-context';
import { PrismaService } from '../src/prisma/prisma.service';
import { HELPER_EMAIL_PREFIX, cleanupHelperUsers, loginAsEmployee } from './helpers/login';

// SS-01 (ADR-011): the `employee` principal exists — and can do nothing yet.

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const AHMED_HASSAN = 'e0000001-0000-4000-8000-000000000002';

describe('Employee principal (SS-01, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await app.close();
  });

  // ---- The database refuses inconsistent accounts -------------------------

  describe('auth_users CHECK constraints', () => {
    const row = (over: Record<string, unknown>) => ({
      email: `${HELPER_EMAIL_PREFIX}${randomUUID()}@example.com`,
      passwordHash: 'x',
      ...over,
    });
    const create = (over: Record<string, unknown>) =>
      prisma.authUser.create({ data: row(over) as never });

    it('accepts each well-formed principal', async () => {
      await expect(create({ principalType: 'staff', role: 'hr_officer' })).resolves.toBeTruthy();
      await expect(
        create({ principalType: 'client_rep', role: 'client_manager', clientId: CLIENT_A }),
      ).resolves.toBeTruthy();
      await expect(
        create({ principalType: 'employee', role: 'employee', employeeId: randomUUID() }),
      ).resolves.toBeTruthy();
    });

    it.each([
      [
        'an employee carrying a company',
        {
          principalType: 'employee',
          role: 'employee',
          employeeId: randomUUID(),
          clientId: CLIENT_A,
        },
      ],
      ['an employee with no employee record', { principalType: 'employee', role: 'employee' }],
      [
        'staff bound to an employee record',
        { principalType: 'staff', role: 'hr_officer', employeeId: randomUUID() },
      ],
      [
        'staff carrying a company',
        { principalType: 'staff', role: 'hr_officer', clientId: CLIENT_A },
      ],
      ['a client rep with no company', { principalType: 'client_rep', role: 'client_manager' }],
      [
        'a client rep bound to an employee record',
        {
          principalType: 'client_rep',
          role: 'client_manager',
          clientId: CLIENT_A,
          employeeId: randomUUID(),
        },
      ],
    ])('refuses %s (binding check)', async (_label, over) => {
      await expect(create(over)).rejects.toThrow(/auth_users_principal_binding_chk/);
    });

    it.each([
      [
        'an employee holding a staff role',
        { principalType: 'employee', role: 'hr_officer', employeeId: randomUUID() },
      ],
      ['staff holding the employee role', { principalType: 'staff', role: 'employee' }],
      [
        'a client rep holding the employee role',
        { principalType: 'client_rep', role: 'employee', clientId: CLIENT_A },
      ],
      // ROLE-03 (ADR-013): the check now ties EVERY principal type to its roles.
      ['staff holding the client role', { principalType: 'staff', role: 'client_manager' }],
      [
        'a client rep holding a staff role',
        { principalType: 'client_rep', role: 'administrator', clientId: CLIENT_A },
      ],
    ])('refuses %s (role check)', async (_label, over) => {
      await expect(create(over)).rejects.toThrow(/auth_users_role_principal_chk/);
    });

    it('refuses a second account for the same employee record', async () => {
      const employeeId = randomUUID();
      await create({ principalType: 'employee', role: 'employee', employeeId });
      await expect(
        create({ principalType: 'employee', role: 'employee', employeeId }),
      ).rejects.toThrow();
    });
  });

  // ---- Sign-in, identity, and nothing else --------------------------------

  let sweep: Awaited<ReturnType<typeof loginAsEmployee>> | undefined;
  const sweepPrincipal = async () => (sweep ??= await loginAsEmployee(app));

  // A fresh record id per account: the seed already binds an account to Ahmed
  // Hassan, and one record may have only one account (the unique index — which
  // is exactly what caught the first draft of this spec).
  it('signs in, and /auth/me reports the employee principal with its record and only its own surface', async () => {
    const emp = await loginAsEmployee(app);
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', emp.cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      userId: emp.userId,
      principalType: 'employee',
      role: 'employee',
      clientId: null,
      employeeId: emp.employeeId,
    });
    // SS-03 added `self-service.read` (the /me surface), SS-05 `self-service.create`
    // (raising one's own request) — and NOTHING a staff or client-rep endpoint
    // checks (the isolation harness's principal fence).
    // SS-07 added the shell's own-identity controls (bell, language).
    // ADR-015 added the header search — a `self` route whose results are the
    // employee's own requests and leave (scoped in-app, proven in search.e2e).
    expect(res.body.permissions).toEqual([
      'session.end',
      'self-service.read',
      'self-service.create',
      'notification.read',
      'config.read-self',
      'config.write-self',
      'search.read',
    ]);
  });

  it.each([
    ['GET', '/employees'],
    ['GET', `/employees/${AHMED_HASSAN}`],
    ['GET', '/documents'],
    ['GET', '/requests'],
    ['POST', '/requests'],
    ['GET', '/gro-processes'],
    ['GET', '/vacancies'],
    ['GET', '/candidates'],
    ['GET', '/tasks'],
    ['GET', '/clients'],
    ['GET', '/reports'],
    ['GET', '/portal/company'],
    ['GET', '/portal/employees'],
  ])('is refused %s %s (403 — deny by default)', async (method, path) => {
    const emp = await sweepPrincipal();
    const http = request(app.getHttpServer());
    const req = method === 'POST' ? http.post(path).send({}) : http.get(path);
    await req.set('Cookie', emp.cookie).expect(403);
  });

  it('signs out, and the session is revoked', async () => {
    const emp = await loginAsEmployee(app);
    const http = app.getHttpServer();
    await request(http).post('/auth/logout').set('Cookie', emp.cookie).expect(200);
    await request(http).get('/auth/me').set('Cookie', emp.cookie).expect(401);
  });

  // ---- scopeOf: the dual-path choice is exhaustive ------------------------

  describe('scopeOf', () => {
    const ctx = (over: Partial<ReturnType<typeof requestContext.create>>) => ({
      ...requestContext.create(),
      actorId: randomUUID(),
      ...over,
    });

    it('staff → staff scope; client rep with a company → that company', () => {
      expect(scopeOf(ctx({ principalType: 'staff' }))).toEqual({ kind: 'staff' });
      expect(scopeOf(ctx({ principalType: 'client_rep', clientId: CLIENT_A }))).toEqual({
        kind: 'client',
        clientId: CLIENT_A,
      });
    });

    it('refuses an employee — it no longer falls through to the cross-client staff path', () => {
      expect(() => scopeOf(ctx({ principalType: 'employee', employeeId: AHMED_HASSAN }))).toThrow(
        ForbiddenException,
      );
    });

    it('refuses a client rep with no company (previously: the staff path)', () => {
      expect(() => scopeOf(ctx({ principalType: 'client_rep', clientId: null }))).toThrow(
        ForbiddenException,
      );
    });

    it('refuses an unauthenticated context', () => {
      expect(() => scopeOf(ctx({ principalType: null }))).toThrow(ForbiddenException);
      expect(() => scopeOf(undefined)).toThrow(ForbiddenException);
    });
  });

  // ---- The old inline choice must not come back ---------------------------

  it('no source file decides the data path with an inline client_rep test', () => {
    const root = join(__dirname, '../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name === 'generated') continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith(join('auth', 'scope.ts'))) {
          if (/principalType\s*===\s*'client_rep'/.test(readFileSync(p, 'utf8'))) offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
