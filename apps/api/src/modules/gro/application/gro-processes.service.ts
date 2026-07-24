import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import type { GroProcessModel as GroProcessRecord } from '../../../generated/prisma/models';
import type { GroProcessStatus, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateGroProcessInput, UpdateGroProcessInput } from '../domain/gro-process';
import { canTransition } from '../domain/gro-status-workflow';

// GRO government-process registry access (GRO-01/02). TWO data paths, both owned
// here:
//   - STAFF path (app_staff, cross-client) via PrismaService — create/update/
//     changeStatus + list/getById.
//   - CLIENT-REP path (app_client, own-client, RLS-enforced) via ScopedPrismaService
//     — READ ONLY (*ForClient); the controller redacts to status-only. Clients never
//     write processes (the SELECT-only grant + no write endpoints enforce this).
// Every mutation writes its audit entry in the SAME transaction (AUDIT-03), scoped
// to the process's client; the snapshot is non-sensitive metadata (type/status/
// dueDate) — never gov reference numbers.
@Injectable()
export class GroProcessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
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

  // Advance a process's status (GRO-02), staff path. Validates the transition
  // (illegal → 400), audits before/after — all in one tx. Returns null if missing.
  async changeStatus(id: string, to: GroProcessStatus): Promise<GroProcessRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.groProcess.findUnique({ where: { id } });
      if (!before) return null;
      if (!canTransition(before.status, to)) {
        throw new BadRequestException(`Cannot move a GRO process from '${before.status}' to '${to}'`);
      }
      const row = await tx.groProcess.update({ where: { id }, data: { status: to } });
      await this.audit.record(tx, {
        resource: 'gro-process',
        action: 'status',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  // ---- client-representative path (own-client, RLS-enforced, READ ONLY) ----

  listForClient(clientId: string): Promise<GroProcessRecord[]> {
    return this.scoped.forClient(clientId).groProcess.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // RLS filters the row to the caller's client, so a foreign id resolves to null.
  findForClient(clientId: string, id: string): Promise<GroProcessRecord | null> {
    return this.scoped.forClient(clientId).groProcess.findUnique({ where: { id } });
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
