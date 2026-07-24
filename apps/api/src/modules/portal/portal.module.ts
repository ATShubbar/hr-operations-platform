import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { PortalController } from './api/portal.controller';

// Client Portal module (ACTION-PLAN 5.1; architecture.md module 10). A pure
// DELIVERY layer — no service/table of its own; it reads the domain modules'
// services (ClientsService now; Employees/Documents in PORTAL-02/03) and the
// self-service flag (ConfigService). A leaf module (nothing imports it), so
// importing ClientsModule + ConfigurationModule creates no cycle.
@Module({
  imports: [ClientsModule, ConfigurationModule],
  controllers: [PortalController],
})
export class PortalModule {}
