import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TaskModel as TaskRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateTaskInput } from '../domain/task';

// Tasks registry access (TASK-01). Staff path only (app_staff) — tasks are
// consultancy-internal, no client-rep path. Every mutation writes its audit entry
// in the same transaction (AUDIT-03). `list` supports an optional own/assigned
// `scopeUserId` (TASK-02): when set, only tasks the user created or is assigned
// to are returned — the matrix "own/assigned" scope for non-admin staff.
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(input: CreateTaskInput): Promise<TaskRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.task.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'task',
        action: 'create',
        clientId: row.clientId ?? undefined,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(filters?: {
    clientId?: string;
    status?: Prisma.TaskWhereInput['status'];
    assigneeUserId?: string;
    scopeUserId?: string; // own/assigned restriction (non-admin staff)
  }): Promise<TaskRecord[]> {
    const f = filters ?? {};
    return this.prisma.task.findMany({
      where: {
        ...(f.clientId ? { clientId: f.clientId } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.assigneeUserId ? { assigneeUserId: f.assigneeUserId } : {}),
        ...(f.scopeUserId
          ? { OR: [{ createdByUserId: f.scopeUserId }, { assigneeUserId: f.scopeUserId }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<TaskRecord | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }
}

function toCreateData(input: CreateTaskInput): Prisma.TaskUncheckedCreateInput {
  return {
    clientId: input.clientId ?? null,
    requestId: input.requestId ?? null,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 'normal',
    assigneeUserId: input.assigneeUserId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    dueDate: input.dueDate ?? null,
  };
}

function snapshot(t: TaskRecord): Prisma.InputJsonValue {
  return {
    clientId: t.clientId ?? null,
    requestId: t.requestId ?? null,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assigneeUserId: t.assigneeUserId ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
  };
}
