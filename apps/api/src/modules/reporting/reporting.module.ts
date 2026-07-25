import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { EmployeesModule } from '../employees/public-api';
import { DocumentsModule } from '../documents/public-api';
import { RecruitmentModule } from '../recruitment/public-api';
import { GroModule } from '../gro/public-api';
import { RequestsModule } from '../requests/public-api';
import { TasksModule } from '../tasks/public-api';
import { ReportsController } from './api/reports.controller';
import { ReportingService } from './application/reporting.service';

// Reporting module (ACTION-PLAN 5.4; architecture module 11; ADR-003 layout).
// The last delivery-layer module: it owns NO tables and reads every domain
// module below it through their public APIs. All of those imports are one-way
// (nothing imports Reporting), so this is a leaf at the top of the graph — no
// cycle. REP-02 adds the HTTP surface: `report.read` admits a caller, and each
// report's own requiredPermissions (checked via AuthModule's PolicyService)
// decides which reports they may list and run.
@Module({
  imports: [
    AuditModule, // REP-03: exporting is an audited READ
    AuthModule,
    ClientsModule,
    EmployeesModule,
    DocumentsModule,
    RecruitmentModule,
    GroModule,
    RequestsModule,
    TasksModule,
  ],
  controllers: [ReportsController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
