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
} from '@nestjs/common';
import {
  inviteEmployeeAccountRequestSchema,
  updateEmployeeAccountRequestSchema,
  type EmployeeAccountResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { EmployeeAccountsService } from '../application/employee-accounts.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// STAFF management of employee self-service accounts (SS-06a). `employee-user.*`
// is held by Company Admin and HR Officer only. Staff act across clients by
// permission, so these are `staff` routes in the isolation registry — and the
// principal fence keeps employees and client reps off them.
@Controller('employee-accounts')
export class EmployeeAccountsController {
  constructor(private readonly accounts: EmployeeAccountsService) {}

  @RequirePermission('employee-user.read')
  @Get(':employeeId')
  get(@Param('employeeId') employeeId: string): Promise<EmployeeAccountResponse> {
    return this.accounts.get(this.id(employeeId));
  }

  // Invite, or re-invite while the invitation is pending (the older link dies).
  @RequirePermission('employee-user.invite')
  @Post(':employeeId/invite')
  @HttpCode(200)
  invite(
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ): Promise<EmployeeAccountResponse> {
    const parsed = inviteEmployeeAccountRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid payload');
    return this.accounts.invite(this.id(employeeId), parsed.data.email);
  }

  // Deactivate (disable + cancel links + end every session) or reactivate.
  @RequirePermission('employee-user.update')
  @Patch(':employeeId')
  update(
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ): Promise<EmployeeAccountResponse> {
    const parsed = updateEmployeeAccountRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid payload');
    return this.accounts.setStatus(this.id(employeeId), parsed.data.status);
  }

  private id(raw: string): string {
    if (!UUID_RE.test(raw)) throw new NotFoundException('Employee not found');
    return raw;
  }
}
