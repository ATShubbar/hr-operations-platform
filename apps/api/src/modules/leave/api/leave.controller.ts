import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  carryOverRequestSchema,
  createLeaveRequestSchema,
  leaveQuerySchema,
  type CarryOverResponse,
  type EmployeeLeaveResponse,
  type LeaveBalanceListResponse,
  type LeaveListResponse,
  type LeaveResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import type { LeaveRequestModel as LeaveRequestRecord } from '../../../generated/prisma/models';
import { LeaveBalanceService } from '../application/leave-balance.service';
import { LeaveCarryOverService } from '../application/leave-carry-over.service';
import { LeavePresenter } from '../application/leave-presenter';
import { LeaveService, type LeaveDecision } from '../application/leave.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Leave API (ADR-014, LEAVE-02) — dual path, like Requests. The path is chosen by
// `scopeOf` (staff → cross-client; client manager → their own company through
// RLS, the company ALWAYS from the session; anyone else → 403). Employees use
// /me/leave (self-service), never these routes.
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly present: LeavePresenter,
    private readonly balances: LeaveBalanceService,
    private readonly carryOver: LeaveCarryOverService,
  ) {}

  @RequirePermission('leave.read')
  @Get()
  async list(@Query() query: unknown): Promise<LeaveListResponse> {
    const q = leaveQuerySchema.safeParse(query);
    const f = q.success ? q.data : {};
    const scope = scopeOf(requestContext.get());
    const rows =
      scope.kind === 'client'
        ? // No clientId filter on this path: RLS decides whose rows exist.
          await this.leave.listForClient(scope.clientId, { employeeId: f.employeeId, status: f.status })
        : await this.leave.list(f);
    return { leave: await this.present.many(rows) };
  }

  // ---- Balances (LEAVE-03) — declared BEFORE :id, or 'balances' would be an id.

  // Everyone still employed: across clients (staff, optional ?clientId) or at the
  // caller's own company (client manager — the company from the session).
  @RequirePermission('leave.read')
  @Get('balances')
  async balanceList(@Query() query: unknown): Promise<LeaveBalanceListResponse> {
    const q = leaveQuerySchema.safeParse(query);
    const scope = scopeOf(requestContext.get());
    return scope.kind === 'client'
      ? this.balances.listForClient(scope.clientId)
      : this.balances.listForStaff({ clientId: q.success ? q.data.clientId : undefined });
  }

  // One person's balance + leave history. Another company's employee → 404.
  @RequirePermission('leave.read')
  @Get('balances/:employeeId')
  async balanceOne(@Param('employeeId') employeeId: string): Promise<EmployeeLeaveResponse> {
    if (!UUID_RE.test(employeeId)) throw new NotFoundException('Employee not found');
    const scope = scopeOf(requestContext.get());
    const found =
      scope.kind === 'client'
        ? await this.balances.oneForClient(scope.clientId, employeeId)
        : await this.balances.oneForStaff(employeeId);
    if (!found) throw new NotFoundException('Employee not found');
    return found;
  }

  // Re-run the yearly carry-over (the 1 January job does it automatically).
  // Idempotent: nobody is credited twice for the same year.
  @RequirePermission('leave.carry-over')
  @Post('carry-over')
  @HttpCode(200)
  async runCarryOver(@Body() body: unknown): Promise<CarryOverResponse> {
    const parsed = carryOverRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid year');
    if (scopeOf(requestContext.get()).kind !== 'staff') throw new ForbiddenException();
    return this.carryOver.run(parsed.data.year, requestContext.get()?.actorId ?? null, {
      clientId: parsed.data.clientId,
    });
  }

  @RequirePermission('leave.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<LeaveResponse> {
    return this.present.one(await this.found(id, (scope) =>
      scope.kind === 'client' ? this.leave.findForClient(scope.clientId, id) : this.leave.findById(id),
    ));
  }

  @RequirePermission('leave.create')
  @Post()
  @HttpCode(201)
  async raise(@Body() body: unknown): Promise<LeaveResponse> {
    const parsed = createLeaveRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid leave request');
    const scope = scopeOf(requestContext.get());
    const row =
      scope.kind === 'client'
        ? await this.leave.raiseForClient(scope.clientId, parsed.data)
        : await this.leave.raise(parsed.data);
    return this.present.one(row);
  }

  @RequirePermission('leave.approve')
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string): Promise<LeaveResponse> {
    return this.decide(id, 'approved');
  }

  @RequirePermission('leave.approve')
  @Post(':id/decline')
  @HttpCode(200)
  decline(@Param('id') id: string): Promise<LeaveResponse> {
    return this.decide(id, 'declined');
  }

  // PEOPLE&GRO files an approved request against the record (writes the ledger).
  // `leave.file` is staff-only in the bundles; the scope check is the backstop.
  @RequirePermission('leave.file')
  @Post(':id/file')
  @HttpCode(200)
  async file(@Param('id') id: string): Promise<LeaveResponse> {
    const scope = scopeOf(requestContext.get());
    if (scope.kind !== 'staff') throw new ForbiddenException('Filing is done by PEOPLE&GRO');
    return this.present.one(await this.found(id, () => this.leave.file(id)));
  }

  @RequirePermission('leave.withdraw')
  @Post(':id/withdraw')
  @HttpCode(200)
  async withdraw(@Param('id') id: string): Promise<LeaveResponse> {
    return this.present.one(await this.found(id, (scope) =>
      scope.kind === 'client' ? this.leave.withdrawForClient(scope.clientId, id) : this.leave.withdraw(id),
    ));
  }

  // A client manager decides for their own company; staff holding leave.approve
  // (the Administrator) decide on the client's behalf — recorded as such.
  private async decide(id: string, decision: LeaveDecision): Promise<LeaveResponse> {
    return this.present.one(await this.found(id, (scope) =>
      scope.kind === 'client'
        ? this.leave.decideForClient(scope.clientId, id, decision)
        : this.leave.decide(id, decision),
    ));
  }

  // Malformed, unknown, or another company's id → the same 404.
  private async found(
    id: string,
    run: (scope: ReturnType<typeof scopeOf>) => Promise<LeaveRequestRecord | null>,
  ): Promise<LeaveRequestRecord> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Leave request not found');
    const row = await run(scopeOf(requestContext.get()));
    if (!row) throw new NotFoundException('Leave request not found');
    return row;
  }
}
