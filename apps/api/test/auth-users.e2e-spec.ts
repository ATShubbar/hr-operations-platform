import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/modules/auth/public-api';

const CLIENT_A = '11111111-1111-4111-8111-111111111111';

describe('Auth users (AUTH-01, e2e)', () => {
  let app: INestApplication;
  let users: UsersService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    users = app.get(UsersService);
    prisma = app.get(PrismaService);
    await prisma.authUser.deleteMany({ where: { email: { startsWith: 'auth01-' } } });
  });

  afterAll(async () => {
    await prisma.authUser.deleteMany({ where: { email: { startsWith: 'auth01-' } } });
    await app.close();
  });

  it('creates a staff user (no client binding)', async () => {
    const user = await users.createStaffUser({
      email: 'AUTH01-staff@example.com',
      passwordHash: 'argon2id$placeholder-until-auth-02',
      role: 'hr_officer',
    });
    expect(user.principalType).toBe('staff');
    expect(user.clientId).toBeNull();
    expect(user.status).toBe('active');
    expect(user.email).toBe('auth01-staff@example.com'); // normalized to lowercase
  });

  it('creates a client-rep user bound to a client', async () => {
    const user = await users.createClientRepUser({
      email: 'auth01-rep@example.com',
      passwordHash: 'argon2id$placeholder-until-auth-02',
      clientId: CLIENT_A,
      role: 'client_admin',
    });
    expect(user.principalType).toBe('client_rep');
    expect(user.clientId).toBe(CLIENT_A);
    expect(user.role).toBe('client_admin');
  });

  it('finds by email case-insensitively', async () => {
    const found = await users.findByEmail('Auth01-Staff@Example.com');
    expect(found?.principalType).toBe('staff');
  });

  it('rejects duplicate emails', async () => {
    await expect(
      users.createStaffUser({
        email: 'auth01-staff@example.com',
        passwordHash: 'x',
        role: 'read_only',
      }),
    ).rejects.toThrow(/unique/i);
  });
});
