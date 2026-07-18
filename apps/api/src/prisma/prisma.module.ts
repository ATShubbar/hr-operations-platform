import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global: every module needs database access through this single service.
// Per-request client selection (staff vs client role) arrives with WS-13.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
