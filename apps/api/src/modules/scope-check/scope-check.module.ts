import { Module } from '@nestjs/common';
import { ScopeCheckController } from './api/scope-check.controller';

@Module({
  controllers: [ScopeCheckController],
})
export class ScopeCheckModule {}
