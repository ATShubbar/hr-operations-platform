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
  createLeaveRequestSchema,
  leaveQuerySchema,
  type LeaveListResponse,
  type LeaveResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import type { LeaveRequestModel as LeaveRequestRecord } from '../../../generated/prisma/models';
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
