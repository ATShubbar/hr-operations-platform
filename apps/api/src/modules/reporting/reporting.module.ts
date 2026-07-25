import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/public-api';
import { EmployeesModule } from '../employees/public-api';
import { DocumentsModule } from '../documents/public-api';
import { RecruitmentModule } from '../recruitment/public-api';
import { GroModule } from '../gro/public-api';
import { RequestsModule } from '../requests/public-api';
import { TasksModule } from '../tasks/public-api';
import { ReportingService } from './application/reporting.service';

// Reporting module (ACTION-PLAN 5.4; architecture module 11; ADR-003 layout).
// The last delivery-layer module: it owns NO tables and reads every domain
// module below it through their public APIs. All of those imports are one-way
// (nothing imports Reporting), so this is a leaf at the top of the graph — no
// cycle. The HTTP surface lands in REP-02; REP-01 is the read models only.
@Module({
  imports: [
    ClientsModule,
    EmployeesModule,
    DocumentsModule,
    RecruitmentModule,
    GroModule,
    RequestsModule,
    TasksModule,
  ],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
