import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { ConfigurationModule } from '../configuration/public-api';
import { EmployeesModule } from '../employees/public-api';
import { GroModule } from '../gro/public-api';
import { LeaveModule } from '../leave/public-api';
import { RequestsModule } from '../requests/public-api';
import { TasksModule } from '../tasks/public-api';
import { SearchController } from './api/search.controller';
import { SearchService } from './application/search.service';

// Global search (ADR-015) — a DELIVERY module at the top of the graph, like
// Reporting and History: it reads the domain modules' public APIs and owns no
// data; nothing imports it, so no cycle can form.
@Module({
  imports: [
    AuditModule,
    AuthModule,
    ClientsModule,
    ConfigurationModule,
    EmployeesModule,
    GroModule,
    LeaveModule,
    RequestsModule,
    TasksModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
