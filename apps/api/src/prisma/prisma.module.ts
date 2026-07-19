import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ScopedPrismaService } from './scoped-prisma.service';

// Global: every module reaches the database through these two services —
// PrismaService for staff-path access, ScopedPrismaService.forClient() for
// client-representative access. Automatic per-request selection arrives
// with the request context (WS-14) and auth (Priority 2).
@Global()
@Module({
  providers: [PrismaService, ScopedPrismaService],
  exports: [PrismaService, ScopedPrismaService],
})
export class PrismaModule {}
