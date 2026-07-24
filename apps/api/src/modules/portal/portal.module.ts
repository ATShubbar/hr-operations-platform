import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { EmployeesModule } from '../employees/public-api';
import { PortalController } from './api/portal.controller';

// Client Portal module (ACTION-PLAN 5.1; architecture.md module 10). A pure
// DELIVERY layer — no service/table of its own; it reads the domain modules'
// services (ClientsService, EmployeesService now; Documents in PORTAL-03) and
// the self-service flag (ConfigService). A leaf module (nothing imports it), so
// importing these domain modules creates no cycle.
@Module({
  imports: [ClientsModule, ConfigurationModule, EmployeesModule],
  controllers: [PortalController],
})
export class PortalModule {}
