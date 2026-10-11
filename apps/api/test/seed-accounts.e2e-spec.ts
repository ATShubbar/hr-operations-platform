import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncSeedAccounts, type SeedAccount } from '../prisma/seed-accounts';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/modules/auth/public-api';
import { PrismaClient } from '../src/generated/prisma/client';

// SEED-02: re-seeding must not change who the sample accounts ARE. The seed
// used to delete and recreate them, so every account got a new id — and a
// browser signed in before the re-seed kept a session carrying an id that no
// longer owned anything ("Assigned to me" empty, names missing). The accounts
// are now updated in place, matched by email.
const DOMAIN = 'seed-accounts-test.local';
const owned = { email: { endsWith: `@${DOMAIN}` } };
const PASSWORD = 'Seed-accounts-test-1';
const CLIENT = 'c2000000-0000-4000-8000-000000000001';

describe('The seed keeps the sample accounts in place (SEED-02, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hash = '';
  const account = (local: string, over: Partial<SeedAccount> = {}): SeedAccount => ({
    email: `${local}@${DOMAIN}`,
    passwordHash: hash,
    principalType: 'staff',
    role: 'hr_officer',
    displayName: `Test ${local}`,
    ...over,
  });
  const byEmail = async (local: string) =>
    owner.authUser.findUnique({ where: { email: `${local}@${DOMAIN}` } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    hash = await new PasswordService().hash(PASSWORD);
    await owner.authUser.deleteMany({ where: owned });
  });

  afterAll(async () => {
    await owner.authUser.deleteMany({ where: owned });
    await owner.$disconnect();
    await app.close();
  });

  it('seeding twice leaves every account with the id it had', async () => {
    const list = [account('hr'), account('gro', { role: 'gro_officer' })];
    await syncSeedAccounts(owner, list, owned);
    const first = [await byEmail('hr'), await byEmail('gro')].map((u) => u?.id);
    expect(first.every(Boolean)).toBe(true);

    await syncSeedAccounts(owner, list, owned);
    const second = [await byEmail('hr'), await byEmail('gro')].map((u) => u?.id);
    expect(second).toEqual(first);
    expect(await owner.authUser.count({ where: owned })).toBe(2);
  });

  it('a session opened before a re-seed is still that person afterwards', async () => {
    const http = () => request(app.getHttpServer());
    const login = await http()
      .post('/auth/login')
      .send({ email: `hr@${DOMAIN}`, password: PASSWORD })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';
    const before = (await http().get('/auth/me').set('Cookie', cookie).expect(200)).body;

    await syncSeedAccounts(owner, [account('hr'), account('gro', { role: 'gro_officer' })], owned);

    const after = (await http().get('/auth/me').set('Cookie', cookie).expect(200)).body;
    expect(after.userId).toBe(before.userId);
    // …and that id is a LIVE account: its name still resolves.
    expect(after.displayName).toBe('Test hr');
    expect((await byEmail('hr'))?.id).toBe(before.userId);
  });

  it('puts back whatever a walk-through changed: name, role, password, status, authenticator', async () => {
    const id = (await byEmail('hr'))?.id ?? '';
    await owner.authUser.update({
      where: { id },
      data: {
        displayName: 'Renamed by hand',
        role: 'gro_officer',
        passwordHash: 'not-the-seed-password',
        status: 'disabled',
        mfaSecret: 'ENROLLEDBYHAND',
        passwordSetAt: new Date(),
      },
    });
    await syncSeedAccounts(owner, [account('hr'), account('gro', { role: 'gro_officer' })], owned);
    const row = await byEmail('hr');
    expect(row).toMatchObject({
      id,
      displayName: 'Test hr',
      role: 'hr_officer',
      passwordHash: hash,
      status: 'active',
      mfaSecret: null, // the seed never fakes an enrolment, and clears one made by hand
      passwordSetAt: null,
    });
  });

  it('an account can change what it is bound to without becoming a new account', async () => {
    // A client manager's company and an employee's record are part of the row.
    await syncSeedAccounts(
      owner,
      [
        account('hr'),
        account('gro', { role: 'gro_officer' }),
        account('client', { principalType: 'client_rep', role: 'client_manager', clientId: CLIENT }),
      ],
      owned,
    );
    const id = (await byEmail('client'))?.id;
    const OTHER = 'c2000000-0000-4000-8000-000000000002';
    await syncSeedAccounts(
      owner,
      [
        account('hr'),
        account('gro', { role: 'gro_officer' }),
        account('client', { principalType: 'client_rep', role: 'client_manager', clientId: OTHER }),
      ],
      owned,
    );
    expect(await byEmail('client')).toMatchObject({ id, clientId: OTHER, employeeId: null });
  });

  it('removes a sample account the seed no longer lists — and nobody else', async () => {
    const outsider = await owner.authUser.create({
      data: {
        email: 'someone@not-the-seed.example',
        passwordHash: hash,
        principalType: 'staff',
        role: 'hr_officer',
      },
    });
    try {
      await syncSeedAccounts(owner, [account('hr')], owned);
      expect(await byEmail('gro')).toBeNull();
      expect(await byEmail('client')).toBeNull();
      expect(await byEmail('hr')).not.toBeNull();
      expect(await owner.authUser.findUnique({ where: { id: outsider.id } })).not.toBeNull();
    } finally {
      await owner.authUser.delete({ where: { id: outsider.id } });
    }
  });
});
