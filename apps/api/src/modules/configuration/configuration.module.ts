import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ConfigController } from './api/config.controller';
import { ConfigService } from './application/config.service';

// Configuration module (ACTION-PLAN 2.4; ADR-003 layout). CONF-01 ships the
// settings catalog + system-level resolution + system write API. Every module
// reads settings through ConfigService (exported). PrismaService is global;
// AuditModule provides the transactional audit for the system write.
@Module({
  imports: [AuditModule],
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigurationModule {}
