import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { EmployeesModule } from '../employees/public-api';
import { SelfServiceController } from './api/self-service.controller';

// Employee self-service — "Me" (ADR-011; architecture.md module 11). A DELIVERY
// module, the counterpart of the Client Portal: no business logic of its own,
// reads Employees / Clients / Configuration through their public APIs, and
// nothing imports it — it sits at the top of the module graph, so no cycle forms.
@Module({
  imports: [ClientsModule, ConfigurationModule, EmployeesModule],
  controllers: [SelfServiceController],
})
export class SelfServiceModule {}
