import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

// Client-representative path (ADR-001, validated by SPIKE-001): connects as
// the RLS-enforced app_client DB role. Every operation obtained via
// forClient() runs in a batch transaction whose first statement sets a
// TRANSACTION-LOCAL scope — it evaporates at commit/rollback, so pooled
// connection reuse cannot leak scope between requests.
//
// maxWait is sized for bursts deeper than the pool (SPIKE-001 finding 2).
// Request-context integration (auth resolving the caller's clientId and
// picking this path automatically) arrives with WS-14/WS-15 and Priority 2.
@Injectable()
export class ScopedPrismaService implements OnModuleDestroy {
  private readonly base: PrismaClient;

  constructor() {
    this.base = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.CLIENT_DATABASE_URL ?? '',
        max: 10,
      }),
      transactionOptions: { maxWait: 10000, timeout: 30000 },
    });
  }

  // Interactive client-scoped transaction (AUDIT-03): opens ONE transaction as
  // app_client, sets the transaction-local scope, then runs the callback with
  // that transaction handle. Use this when a mutation and its audit entry (or
  // several statements) must commit or roll back together under RLS — the
  // per-operation forClient() wrapper cannot span multiple statements. The GUC
  // is transaction-local (TRUE), so pooled reuse cannot leak scope.
  async transaction<T>(
    clientId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.base.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.client_id', ${clientId}, TRUE)`;
      return fn(tx);
    });
  }

  forClient(clientId: string) {
    const base = this.base;
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

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
