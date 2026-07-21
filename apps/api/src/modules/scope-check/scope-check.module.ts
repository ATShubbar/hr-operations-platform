import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ScopeCheckController } from './api/scope-check.controller';

@Module({
  imports: [AuditModule],
  controllers: [ScopeCheckController],
})
export class ScopeCheckModule {}
