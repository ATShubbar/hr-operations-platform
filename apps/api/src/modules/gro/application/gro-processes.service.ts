import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { GroProcessModel as GroProcessRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateGroProcessInput, UpdateGroProcessInput } from '../domain/gro-process';

// GRO government-process registry access (GRO-01). Staff path only (app_staff,
// cross-client) via PrismaService — the client-rep read-own path (ScopedPrismaService,
// status-only) lands with GRO-02's dual-path API. Every mutation writes its audit
// entry in the SAME transaction (AUDIT-03), scoped to the process's client; the
// snapshot is non-sensitive metadata (type/status/dueDate) — never gov identifiers.
@Injectable()
export class GroProcessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateGroProcessInput): Promise<GroProcessRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.groProcess.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'gro-process',
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(filters?: { clientId?: string; employeeId?: string }): Promise<GroProcessRecord[]> {
    return this.prisma.groProcess.findMany({
      where: {
        ...(filters?.clientId ? { clientId: filters.clientId } : {}),
        ...(filters?.employeeId ? { employeeId: filters.employeeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getById(id: string): Promise<GroProcessRecord | null> {
    return this.prisma.groProcess.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateGroProcessInput): Promise<GroProcessRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.groProcess.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.groProcess.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'gro-process',
        action: 'update',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }
}

function toCreateData(input: CreateGroProcessInput): Prisma.GroProcessUncheckedCreateInput {
  return {
    clientId: input.clientId,
    employeeId: input.employeeId,
    type: input.type,
    referenceNumber: input.referenceNumber ?? null,
    dueDate: input.dueDate ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId ?? null,
  };
}

function toUpdateData(data: UpdateGroProcessInput): Prisma.GroProcessUpdateInput {
  return {
    ...(data.referenceNumber !== undefined ? { referenceNumber: data.referenceNumber } : {}),
    ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
    ...(data.assigneeUserId !== undefined ? { assigneeUserId: data.assigneeUserId } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
  };
}

function snapshot(p: GroProcessRecord): Prisma.InputJsonValue {
  return {
    type: p.type,
    status: p.status,
    dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
    assigneeUserId: p.assigneeUserId ?? null,
  };
}
