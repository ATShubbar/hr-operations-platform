import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export const CLIENT_A = '11111111-1111-4111-8111-111111111111';
export const CLIENT_B = '22222222-2222-4222-8222-222222222222';

const STAFF_URL = process.env.SPIKE_STAFF_URL ?? '';
const CLIENT_URL = process.env.SPIKE_CLIENT_URL ?? '';
const OWNER_URL = process.env.SPIKE_DATABASE_URL ?? '';

export function makeStaffClient(max = 5): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: STAFF_URL, max }) });
}

// Base client for the spike_client DB role — UNSCOPED. Used directly it must
// see zero rows (fail-closed proof); production code only ever uses scoped().
// SPIKE FINDING: transaction maxWait must be sized for bursts deeper than the
// pool — the 2s default times out under 40 concurrent ops on a 2-conn pool.
export function makeClientBase(max = 5): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: CLIENT_URL, max }),
    transactionOptions: { maxWait: 20000, timeout: 30000 },
  });
}

export function makeOwnerClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: OWNER_URL, max: 2 }) });
}

// ADR-001 Pattern A: every operation runs in a batch transaction whose first
// statement sets a TRANSACTION-LOCAL scope (set_config third arg = TRUE).
// The setting evaporates at commit/rollback, so pooled-connection reuse
// cannot leak scope between requests.
export function scoped(base: PrismaClient, clientId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.client_id', ${clientId}, TRUE)`,
            query(args) as never,
          ]);
          return result;
        },
      },
    },
  });
}
