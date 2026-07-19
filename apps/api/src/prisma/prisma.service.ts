import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Staff-path client: connects as the app_staff DB role. Staff authorization
// is enforced by the application policy service (ADR-002); RLS grants staff
// a permissive policy. Migrations use the owner connection (DATABASE_URL),
// never this one.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.STAFF_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
