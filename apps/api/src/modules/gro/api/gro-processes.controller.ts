import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  changeGroProcessStatusRequestSchema,
  createGroProcessRequestSchema,
  groProcessQuerySchema,
  updateGroProcessRequestSchema,
  type GroProcessListResponse,
  type GroProcessResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { GroProcessModel as GroProcessRecord } from '../../../generated/prisma/models';
import { EmployeesService } from '../../employees/public-api';
import { GroProcessesService } from '../application/gro-processes.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GRO processes API (GRO-02) — a DUAL-PATH resource. Consultancy staff manage
// processes across all clients (create/update/status); client reps READ ONLY their
// own client's processes, STATUS-ONLY (referenceNumber/notes/assignee redacted —
// matrix "R own, status only"). Reads pick the path by principal (a client_rep goes
// through the RLS-enforced scoped path, the clientId ALWAYS from the session); all
// writes are staff-only (client roles lack gro.process). The clientId is DERIVED
// from the employee on create, never taken from input.
@Controller('gro-processes')
export class GroProcessesController {
  constructor(
    private readonly gro: GroProcessesService,
    private readonly employees: EmployeesService,
  ) {}

  @RequirePermission('gro.process')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<GroProcessResponse> {
    const parsed = createGroProcessRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid GRO process payload');
    const req = parsed.data;

    const employee = await this.employees.getById(req.employeeId);
    if (!employee) throw new NotFoundException('Employee not found');

    const row = await this.gro.create({
      clientId: employee.clientId, // derived from the employee, never input
      employeeId: req.employeeId,
      type: req.type,
      referenceNumber: req.referenceNumber ?? null,
      dueDate: req.dueDate ?? null,
      assigneeUserId: req.assigneeUserId ?? null,
      notes: req.notes ?? null,
      createdByUserId: requestContext.get()?.actorId ?? null,
    });
    return toResponse(row, false);
  }

  @RequirePermission('gro.read')
  @Get()
  async list(@Query() query: unknown): Promise<GroProcessListResponse> {
    const ctx = requestContext.get();
    if (ctx?.principalType === 'client_rep' && ctx.clientId) {
      const rows = await this.gro.listForClient(ctx.clientId);
      return { processes: rows.map((r) => toResponse(r, true)) };
    }
    const q = groProcessQuerySchema.safeParse(query);
    const filters = q.success ? q.data : {};
    const rows = await this.gro.list(filters);
    return { processes: rows.map((r) => toResponse(r, false)) };
  }

  @RequirePermission('gro.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<GroProcessResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('GRO process not found');
    const ctx = requestContext.get();
    const isRep = ctx?.principalType === 'client_rep' && !!ctx.clientId;
    const row = isRep
      ? await this.gro.findForClient(ctx!.clientId!, id)
      : await this.gro.getById(id);
    if (!row) throw new NotFoundException('GRO process not found');
    return toResponse(row, isRep);
  }

  @RequirePermission('gro.process')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<GroProcessResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('GRO process not found');
    const parsed = updateGroProcessRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid GRO process payload');
    const row = await this.gro.update(id, parsed.data);
    if (!row) throw new NotFoundException('GRO process not found');
    return toResponse(row, false);
  }

  // Advance the workflow (GRO-02) — STAFF only (client reps lack gro.process).
  // Validates the transition (illegal → 400).
  @RequirePermission('gro.process')
  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(@Param('id') id: string, @Body() body: unknown): Promise<GroProcessResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('GRO process not found');
    const parsed = changeGroProcessStatusRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid status payload');
    const row = await this.gro.changeStatus(id, parsed.data.status);
    if (!row) throw new NotFoundException('GRO process not found');
    return toResponse(row, false);
  }
}

// `redacted` = the client-rep status-only view: type/status/dueDate are visible,
// but referenceNumber (gov reference), notes, and the internal assignee are hidden.
function toResponse(p: GroProcessRecord, redacted: boolean): GroProcessResponse {
  return {
    id: p.id,
    clientId: p.clientId,
    employeeId: p.employeeId,
    type: p.type,
    status: p.status,
    referenceNumber: redacted ? null : p.referenceNumber,
    dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
    assigneeUserId: redacted ? null : p.assigneeUserId,
    notes: redacted ? null : p.notes,
    createdByUserId: redacted ? null : p.createdByUserId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
