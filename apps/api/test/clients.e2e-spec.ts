import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { ClientsService } from '../src/modules/clients/public-api';

// CLIENT-01: the client-company registry. Staff manage all clients via
// ClientsService (app_staff path). A client-rep may READ ONLY its own company
// row, and never write — and here the RLS scope key is the row's OWN primary
// key, not a client_id column.

const C1 = 'c1c1c1c1-0000-4000-8000-000000000001';
const C2 = 'c2c2c2c2-0000-4000-8000-000000000002';
const MARK = 'CLIENT-01-test';

describe('Clients registry — service + RLS (CLIENT-01, e2e)', () => {
  let app: INestApplication;
  let clients: ClientsService;
  let owner: PrismaClient; // migrations/owner — setup + cleanup (bypasses RLS)
  let clientDb: PrismaClient; // app_client — RLS-enforced

  // Read cli_clients as a client-rep within a transaction-local scope.
  async function readScoped(scope: string): Promise<Array<{ id: string }>> {
    const [, rows] = await clientDb.$transaction([
      clientDb.$executeRaw`SELECT set_config('app.client_id', ${scope}, TRUE)`,
      clientDb.$queryRaw`SELECT id FROM cli_clients`,
    ]);
    return rows as Array<{ id: string }>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    clients = app.get(ClientsService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    clientDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.CLIENT_DATABASE_URL ?? '' }),
    });
    await owner.client.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await owner.client.createMany({
      data: [
        { id: C1, nameAr: `${MARK}-ar-1`, nameEn: `${MARK} one` },
        { id: C2, nameAr: `${MARK}-ar-2`, nameEn: `${MARK} two` },
      ],
    });
  });

  afterAll(async () => {
    await owner.client.deleteMany({ where: { nameEn: { startsWith: MARK } } });
    await Promise.all([owner.$disconnect(), clientDb.$disconnect()]);
    await app.close();
  });

  it('staff can create, read back, and list client companies', async () => {
    const created = await clients.create({
      nameAr: `${MARK}-ar-new`,
      nameEn: `${MARK} staff-create`,
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('active');

    const got = await clients.getById(created.id);
    expect(got?.nameEn).toBe(`${MARK} staff-create`);

    const all = await clients.list();
    expect(all.some((c) => c.id === created.id)).toBe(true);
    // Staff see every client (permissive staff policy), incl. both test rows.
    expect(all.some((c) => c.id === C1) && all.some((c) => c.id === C2)).toBe(true);
  });

  it('client-rep reads ONLY its own company row (RLS keyed on the PK)', async () => {
    const rowsA = await readScoped(C1);
    expect(rowsA.length).toBe(1);
    expect(rowsA[0]?.id).toBe(C1);

    const rowsB = await readScoped(C2);
    expect(rowsB.length).toBe(1);
    expect(rowsB[0]?.id).toBe(C2);
    // Never the other client's row.
    expect(rowsB.some((r) => r.id === C1)).toBe(false);
  });

  it('client-rep cannot write client companies (no grant)', async () => {
    await expect(
      clientDb.$executeRawUnsafe(
        `INSERT INTO cli_clients (id, name_ar, name_en) VALUES (gen_random_uuid(), 'x', 'y')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      clientDb.$executeRawUnsafe(`UPDATE cli_clients SET name_en = 'z' WHERE id = '${C1}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      clientDb.$executeRawUnsafe(`DELETE FROM cli_clients WHERE id = '${C1}'`),
    ).rejects.toThrow(/permission denied/i);
  });
});
