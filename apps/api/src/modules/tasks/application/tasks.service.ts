import { BadRequestException, Injectable } from '@nestjs/common';
import { requestContext } from '../../../context/request-context';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TaskModel as TaskRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { EventBus } from '../../events/public-api';
import { TaskAssignedEvent } from '../domain/task-assigned.event';
import type { CreateTaskInput, UpdateTaskInput } from '../domain/task';

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
    private readonly users: UsersService,
    private readonly events: EventBus,
  ) {}

  // ASSIGN-01: a task goes only to someone who can work tasks — Auth's shared
  // rule (an active staff account holding task.update). Clearing it is fine.
  private async assertAssignable(userId: string | null | undefined): Promise<void> {
    if (userId && !(await this.users.isActiveStaffWith(userId, 'task.update'))) {
      throw new BadRequestException('A task can only be assigned to someone who works on tasks');
    }
  }

  // Tell the new assignee (ASSIGN-01) — Notifications decides, and skips self.
  private async publishAssigned(row: TaskRecord): Promise<void> {
    if (!row.assigneeUserId) return;
    await this.events.publish(
      new TaskAssignedEvent(
        row.id,
        row.title,
        row.assigneeUserId,
        requestContext.get()?.actorId ?? null,
        requestContext.get()?.requestId ?? null,
      ),
    );
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    await this.assertAssignable(input.assigneeUserId);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.task.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'task',
        action: 'create',
        clientId: row.clientId ?? undefined,
        after: snapshot(row),
      });
      return row;
    });
    await this.publishAssigned(created);
    return created;
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

  async update(id: string, data: UpdateTaskInput): Promise<TaskRecord | null> {
    await this.assertAssignable(data.assigneeUserId);
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.task.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.task.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'task',
        action: 'update',
        clientId: row.clientId ?? undefined,
        before: snapshot(before),
        after: snapshot(row),
      });
      return { before, row };
    });
    if (!result) return null;
    if (result.row.assigneeUserId !== result.before.assigneeUserId) await this.publishAssigned(result.row);
    return result.row;
  }

  /**
   * TASK-05: the request's due date moved — its OPEN task(s) follow (each change
   * audited as an ordinary task update). A finished task is left alone.
   */
  async followRequestDueDate(requestId: string, dueDate: Date | null): Promise<void> {
    const open = await this.prisma.task.findMany({
      where: { requestId, status: { in: ['open', 'in_progress'] } },
    });
    for (const t of open) {
      if ((t.dueDate?.getTime() ?? null) !== (dueDate?.getTime() ?? null)) await this.update(t.id, { dueDate });
    }
  }

  async remove(id: string): Promise<TaskRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.task.findUnique({ where: { id } });
      if (!before) return null;
      await tx.task.delete({ where: { id } });
      await this.audit.record(tx, {
        resource: 'task',
        action: 'delete',
        clientId: before.clientId ?? undefined,
        before: snapshot(before),
      });
      return before;
    });
  }
}

function toUpdateData(data: UpdateTaskInput): Prisma.TaskUpdateInput {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.priority !== undefined ? { priority: data.priority } : {}),
    ...(data.assigneeUserId !== undefined ? { assigneeUserId: data.assigneeUserId } : {}),
    ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
  };
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
