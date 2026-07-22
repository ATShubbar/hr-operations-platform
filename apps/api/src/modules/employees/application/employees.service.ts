import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';

// Employee registry access (EMP-01/02). Staff path only. Every mutation writes
// its audit entry in the same transaction (AUDIT-03), scoped to the employee's
// client. The audit snapshot is deliberately NON-SENSITIVE (core identity +
// which action) — salary/govdata values never enter the audit trail.
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(data: Prisma.EmployeeUncheckedCreateInput): Promise<EmployeeRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.employee.create({ data });
      await this.audit.record(tx, {
        resource: 'employee',
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  // One update path; `action` distinguishes core / salary / govdata / terminate
  // in the audit trail without leaking the changed values.
  update(
    id: string,
    data: Prisma.EmployeeUncheckedUpdateInput,
    action: string,
  ): Promise<EmployeeRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.employee.update({ where: { id }, data });
      await this.audit.record(tx, {
        resource: 'employee',
        action,
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  list(clientId?: string): Promise<EmployeeRecord[]> {
    return this.prisma.employee.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { nameEn: 'asc' },
    });
  }

  listByClient(clientId: string): Promise<EmployeeRecord[]> {
    return this.list(clientId);
  }

  getById(id: string): Promise<EmployeeRecord | null> {
    return this.prisma.employee.findUnique({ where: { id } });
  }
}

function snapshot(e: EmployeeRecord): Prisma.InputJsonValue {
  return { nameEn: e.nameEn, employmentStatus: e.employmentStatus, contractType: e.contractType };
}
