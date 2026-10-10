import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { ClientsModule } from '../clients/public-api';
import { EmployeesModule } from '../employees/public-api';
import { GroModule } from '../gro/public-api';
import { StorageModule } from '../storage/public-api';
import { FeesController } from './api/fees.controller';
import { FeeReceiptsService } from './application/fee-receipts.service';
import { FeesService } from './application/fees.service';
import { StepReopenedHandler } from './application/step-reopened.handler';

// Billing (ADR-020, architecture module 15). BILL-01: the ledger of government
// fees paid on clients' behalf. Billing READS Clients, Employees and GRO (to
// check what a fee is for and whose it is) — one-way: none of them imports
// Billing, so there is no cycle. AuditModule provides the transactional audit;
// AuthModule the display names; Prisma is @Global.
// BILL-02: receipts go through StorageModule (presigned upload, then the same
// size / virus / type checks as every other file); StepReopenedHandler
// subscribes to GRO's "step reopened" and voids that step's fee (ADR-004).
@Module({
  imports: [AuditModule, AuthModule, ClientsModule, EmployeesModule, GroModule, StorageModule],
  controllers: [FeesController],
  providers: [FeesService, FeeReceiptsService, StepReopenedHandler],
  exports: [FeesService],
})
export class BillingModule {}
