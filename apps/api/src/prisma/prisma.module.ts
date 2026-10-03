import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EmployeeScopedPrismaService } from './employee-scoped-prisma.service';
import { ScopedPrismaService } from './scoped-prisma.service';

// Global: every module reaches the database through these services —
// PrismaService for staff-path access, ScopedPrismaService.forClient() for
// client-representative access, EmployeeScopedPrismaService.forEmployee() for
// employee self-service (SS-02). Automatic per-request selection arrives
// with the request context (WS-14) and auth (Priority 2).
@Global()
@Module({
  providers: [PrismaService, ScopedPrismaService, EmployeeScopedPrismaService],
  exports: [PrismaService, ScopedPrismaService, EmployeeScopedPrismaService],
})
export class PrismaModule {}
