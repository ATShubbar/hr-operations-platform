import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

// Employee self-service path (ADR-011, SS-02): connects as the app_employee DB
// role, whose RLS policies admit exactly ONE employee's rows — the employee id
// set for the transaction. The counterpart of ScopedPrismaService (client reps)
// and built the same way (SPIKE-001): every operation runs in a transaction
// whose first statement sets a TRANSACTION-LOCAL scope, so pooled connection
// reuse cannot carry one employee's scope into another request.
//
// app_employee can READ emp_employees and doc_documents and nothing else — any
// other table is "permission denied", and every write is refused. Callers must
// take the employee id from the session (request context), never from input:
// RLS fences a session to the id it is given; choosing that id is the
// application's job.
@Injectable()
export class EmployeeScopedPrismaService implements OnModuleDestroy {
  private readonly base: PrismaClient;

  constructor() {
    this.base = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.EMPLOYEE_DATABASE_URL ?? '',
        max: 10,
      }),
      transactionOptions: { maxWait: 10000, timeout: 30000 },
    });
  }

  // Interactive transaction under one employee's scope, for reads that span
  // several statements (e.g. a record and its documents in one consistent view).
  async transaction<T>(
    employeeId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.base.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.employee_id', ${employeeId}, TRUE)`;
      return fn(tx);
    });
  }

  // Per-operation wrapper: each query becomes [set scope, query] in one batch
  // transaction.
  forEmployee(employeeId: string) {
    const base = this.base;
    return base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.employee_id', ${employeeId}, TRUE)`,
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
