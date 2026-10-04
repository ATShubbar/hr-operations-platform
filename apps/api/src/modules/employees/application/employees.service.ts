import { Injectable } from '@nestjs/common';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { requestContext } from '../../../context/request-context';
import { AuditService } from '../../audit/public-api';
import { EventBus } from '../../events/public-api';
import { EmployeeTerminatedEvent } from '../domain/employee-terminated.event';

// Employee registry access (EMP-01/02). Staff path only. Every mutation writes
// its audit entry in the same transaction (AUDIT-03), scoped to the employee's
// client. The audit snapshot is deliberately NON-SENSITIVE (core identity +
// which action) — salary/govdata values never enter the audit trail.
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employeeDb: EmployeeScopedPrismaService,
    private readonly events: EventBus,
  ) {}

  // Employee self-service (SS-03, ADR-011): the caller's OWN record, read through
  // the app_employee connection — so even this unfiltered query can only return
  // the one row the database scope admits (SS-02). The id MUST come from the
  // session, never from request input: RLS fences a session to the id it is
  // given; choosing that id is the caller's job.
  async getSelf(employeeId: string): Promise<EmployeeRecord | null> {
    const rows = await this.employeeDb.forEmployee(employeeId).employee.findMany();
    return rows[0] ?? null;
  }

  create(data: Prisma.EmployeeUncheckedCreateInput): Promise<EmployeeRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.employee.create({ data });
      await this.audit.record(tx, {
        resource: 'employee',
        resourceId: row.id,
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  // One update path; `action` distinguishes core / salary / govdata / terminate
  // in the audit trail without leaking the changed values.
  async update(
    id: string,
    data: Prisma.EmployeeUncheckedUpdateInput,
    action: string,
  ): Promise<EmployeeRecord | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.employee.update({ where: { id }, data });
      await this.audit.record(tx, {
        resource: 'employee',
        resourceId: id,
        action,
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return { before, row };
    });
    if (!result) return null;
    // SS-06a: the transition INTO terminated — whichever path made it — is a
    // fact other modules act on (self-service closes the account). Published
    // after commit, so a consumer never sees an uncommitted termination; the bus
    // is awaited and error-isolated (a failing consumer never undoes it).
    if (result.before.employmentStatus !== 'terminated' && result.row.employmentStatus === 'terminated') {
      await this.events.publish(
        new EmployeeTerminatedEvent(result.row.id, result.row.clientId, requestContext.get()?.requestId ?? null),
      );
    }
    return result.row;
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

  // Names only, for rows another module has ALREADY let the caller see (LEAVE-02:
  // a leave request names its employee). Never a way to look someone up — the
  // caller passes ids from records it was allowed to read.
  async namesOf(ids: readonly string[]): Promise<Map<string, { nameEn: string; nameAr: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    return new Map(rows.map((r) => [r.id, { nameEn: r.nameEn, nameAr: r.nameAr }]));
  }
}

function snapshot(e: EmployeeRecord): Prisma.InputJsonValue {
  return { nameEn: e.nameEn, employmentStatus: e.employmentStatus, contractType: e.contractType };
}
