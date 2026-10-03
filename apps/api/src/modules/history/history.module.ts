import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { DocumentsModule } from '../documents/public-api';
import { EmployeesModule } from '../employees/public-api';
import { GroModule } from '../gro/public-api';
import { EmployeeHistoryController } from './api/employee-history.controller';

// History module (AUDIT-06; ADR-003 layout). A delivery-layer LEAF: it owns no
// tables and nothing imports it. It assembles one person's history from the
// audit trail — the person's own entries, their documents' and their GRO
// processes' — by asking each owning module for the ids (Employees, Documents,
// GRO) and the Audit module for the entries. Audit never reads another module's
// tables; this module never reads any table directly.
@Module({
  imports: [AuditModule, AuthModule, EmployeesModule, DocumentsModule, GroModule],
  controllers: [EmployeeHistoryController],
})
export class HistoryModule {}
