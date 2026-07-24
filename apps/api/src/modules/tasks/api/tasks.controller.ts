import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createTaskRequestSchema,
  taskQuerySchema,
  updateTaskRequestSchema,
  type TaskListResponse,
  type TaskResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import { PolicyService } from '../../auth/public-api';
import type { TaskModel as TaskRecord } from '../../../generated/prisma/models';
import { TasksService } from '../application/tasks.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tasks API (TASK-02) — staff-only, cross-client (no client-rep path). The matrix
// "own/assigned" scope for the non-admin roles is a finer, in-handler check on
// top of the coarse permission: holders of `task.read-all` (admins + read-only)
// see/act on every task; everyone else is restricted to tasks they created or
// are assigned to.
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly policy: PolicyService,
  ) {}

  @RequirePermission('task.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<TaskResponse> {
    const parsed = createTaskRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid task payload');
    const req = parsed.data;
    const row = await this.tasks.create({
      clientId: req.clientId ?? null,
      requestId: req.requestId ?? null,
      title: req.title,
      description: req.description ?? null,
      priority: req.priority,
      assigneeUserId: req.assigneeUserId ?? null,
      createdByUserId: this.actorId(),
      dueDate: req.dueDate ?? null,
    });
    return toResponse(row);
  }

  @RequirePermission('task.read')
  @Get()
  async list(@Query() query: unknown): Promise<TaskListResponse> {
    const q = taskQuerySchema.safeParse(query);
    const f = q.success ? q.data : {};
    const rows = await this.tasks.list({
      clientId: f.clientId,
      status: f.status,
      assigneeUserId: f.assigneeUserId,
      scopeUserId: this.unrestricted() ? undefined : this.actorId(),
    });
    return { tasks: rows.map(toResponse) };
  }

  @RequirePermission('task.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<TaskResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Task not found');
    const task = await this.visible(id);
    if (!task) throw new NotFoundException('Task not found');
    return toResponse(task);
  }

  @RequirePermission('task.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<TaskResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Task not found');
    const parsed = updateTaskRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid task payload');
    // Own/assigned scope: a non-admin can only update tasks in their scope.
    if (!(await this.visible(id))) throw new NotFoundException('Task not found');
    const row = await this.tasks.update(id, parsed.data);
    if (!row) throw new NotFoundException('Task not found');
    return toResponse(row);
  }

  @RequirePermission('task.delete')
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: true }> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Task not found');
    // task.delete is admin-only (holds task.read-all) — no scope narrowing needed.
    const row = await this.tasks.remove(id);
    if (!row) throw new NotFoundException('Task not found');
    return { deleted: true };
  }

  private actorId(): string {
    const id = requestContext.get()?.actorId;
    if (!id) throw new ForbiddenException('No authenticated actor');
    return id;
  }

  private unrestricted(): boolean {
    return this.policy.can(requestContext.get()?.role, 'task.read-all');
  }

  // The task if it's visible to the caller (own/assigned, or unrestricted), else null.
  private async visible(id: string): Promise<TaskRecord | null> {
    const task = await this.tasks.findById(id);
    if (!task) return null;
    if (this.unrestricted()) return task;
    const me = this.actorId();
    return task.createdByUserId === me || task.assigneeUserId === me ? task : null;
  }
}

function toResponse(t: TaskRecord): TaskResponse {
  return {
    id: t.id,
    clientId: t.clientId,
    requestId: t.requestId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeUserId: t.assigneeUserId,
    createdByUserId: t.createdByUserId,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
