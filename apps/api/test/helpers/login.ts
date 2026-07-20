import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  PasswordService,
  UsersService,
  type ClientRole,
  type StaffRole,
} from '../../src/modules/auth/public-api';

// Shared e2e helper (AUTH-03): creates a real user and logs in through the
// real endpoint, returning the session cookie. Prefix all helper users so
// cleanup is a single deleteMany.

const HELPER_PASSWORD = 'e2e-helper-password-1';
export const HELPER_EMAIL_PREFIX = 'e2e-helper-';

export interface TestPrincipal {
  cookie: string;
  userId: string;
  email: string;
}

// Default is hr_officer: admin roles (system_admin/company_admin) require
// MFA enrollment (AUTH-06) and get limited sessions until enrolled — use an
// explicit admin role only when testing that flow.
export async function loginAsStaff(
  app: INestApplication,
  role: StaffRole = 'hr_officer',
): Promise<TestPrincipal> {
  return createAndLogin(app, null, role);
}

export async function loginAsClientRep(
  app: INestApplication,
  clientId: string,
  role: ClientRole = 'client_admin',
): Promise<TestPrincipal> {
  return createAndLogin(app, clientId, role);
}

async function createAndLogin(
  app: INestApplication,
  clientId: string | null,
  role: StaffRole | ClientRole,
): Promise<TestPrincipal> {
  const users = app.get(UsersService);
  const passwords = app.get(PasswordService);
  const email = `${HELPER_EMAIL_PREFIX}${randomUUID()}@example.com`;
  const passwordHash = await passwords.hash(HELPER_PASSWORD);

  const user = clientId
    ? await users.createClientRepUser({
        email,
        passwordHash,
        clientId,
        role: role as ClientRole,
      })
    : await users.createStaffUser({ email, passwordHash, role: role as StaffRole });

  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: HELPER_PASSWORD })
    .expect(200);

  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie.find((c) => c.startsWith('hr_session=')) ?? '';
  return { cookie: cookie.split(';')[0] ?? '', userId: user.id, email };
}

export async function cleanupHelperUsers(app: INestApplication): Promise<void> {
  await app
    .get(PrismaService)
    .authUser.deleteMany({ where: { email: { startsWith: HELPER_EMAIL_PREFIX } } });
}
