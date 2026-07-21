import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';

// AUDIT-02: aud_entries is now writable by the client-rep DB role (app_client),
// but only for the caller's own client, and still not readable/updatable/
// deletable by it. Connect directly as each role to probe the grant + RLS
// matrix (no Nest app needed — this is a database-capability test).

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const ACTOR = '99999999-9999-4999-8999-999999999999';
const RESOURCE = 'test-audit-02';

function connect(url: string | undefined): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
}

describe('Audit client-rep write path — grant + RLS (AUDIT-02, e2e)', () => {
  let client: PrismaClient; // app_client (RLS-enforced)
  let staff: PrismaClient; // app_staff
  let owner: PrismaClient; // migrations/owner — cleanup only (bypasses RLS)

  // Insert one audit row as app_client inside a transaction-local set_config
  // scope, using raw INSERT WITHOUT RETURNING (RETURNING would need SELECT,
  // which app_client lacks — this is the AUDIT-02 finding, asserted below).
  function clientInsert(scope: string, clientId: string): Promise<unknown> {
    return client.$transaction([
      client.$executeRaw`SELECT set_config('app.client_id', ${scope}, TRUE)`,
      client.$executeRaw`INSERT INTO aud_entries (actor_id, client_id, resource, action)
        VALUES (${ACTOR}::uuid, ${clientId}::uuid, ${RESOURCE}, 'create')`,
    ]);
  }

  beforeAll(async () => {
    client = connect(process.env.CLIENT_DATABASE_URL);
    staff = connect(process.env.STAFF_DATABASE_URL);
    owner = connect(process.env.DATABASE_URL);
    await owner.auditEntry.deleteMany({ where: { resource: RESOURCE } });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: RESOURCE } });
    await Promise.all([client.$disconnect(), staff.$disconnect(), owner.$disconnect()]);
  });

  it('app_client INSERTs an audit row for its OWN client', async () => {
    const res = (await clientInsert(CLIENT_A, CLIENT_A)) as number[];
    expect(res[1]).toBe(1); // one row inserted
    const rows = await owner.auditEntry.findMany({
      where: { resource: RESOURCE, clientId: CLIENT_A },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('create');
  });

  it('app_client CANNOT INSERT an audit row for a DIFFERENT client (RLS WITH CHECK)', async () => {
    await expect(clientInsert(CLIENT_A, CLIENT_B)).rejects.toThrow(/row-level security/i);
    // Nothing leaked through for client B.
    const leaked = await owner.auditEntry.count({
      where: { resource: RESOURCE, clientId: CLIENT_B },
    });
    expect(leaked).toBe(0);
  });

  it('app_client CANNOT read audit rows (no SELECT grant)', async () => {
    await expect(client.$queryRawUnsafe(`SELECT count(*) FROM aud_entries`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('app_client CANNOT UPDATE or DELETE audit rows (no grant)', async () => {
    await expect(
      client.$executeRawUnsafe(`UPDATE aud_entries SET action = 'x' WHERE resource = '${RESOURCE}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      client.$executeRawUnsafe(`DELETE FROM aud_entries WHERE resource = '${RESOURCE}'`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('FINDING: app_client INSERT ... RETURNING is denied (RETURNING needs SELECT)', async () => {
    await expect(
      client.$transaction([
        client.$executeRaw`SELECT set_config('app.client_id', ${CLIENT_A}, TRUE)`,
        client.$queryRaw`INSERT INTO aud_entries (actor_id, client_id, resource, action)
          VALUES (${ACTOR}::uuid, ${CLIENT_A}::uuid, ${RESOURCE}, 'ret') RETURNING id`,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('app_staff is UNAFFECTED: still reads all + inserts (permissive staff policy)', async () => {
    await staff.$transaction(async (tx) => {
      await tx.auditEntry.create({
        data: { actorId: ACTOR, resource: RESOURCE, action: 'staff-write', clientId: null },
      });
    });
    // Staff sees every row regardless of client_id (RLS staff_full_access).
    const staffCount = await staff.auditEntry.count({ where: { resource: RESOURCE } });
    expect(staffCount).toBeGreaterThanOrEqual(2); // client-A row + staff row
  });
});
