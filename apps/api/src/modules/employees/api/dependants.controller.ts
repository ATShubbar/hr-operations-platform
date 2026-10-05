import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createDependantSchema,
  updateDependantSchema,
  type DependantListResponse,
  type DependantResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { PolicyService } from '../../auth/public-api';
import { DependantsService } from '../application/dependants.service';
import { EmployeesService } from '../application/employees.service';
import { toDependantResponse } from '../domain/dependant-view';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dependants API, staff path (DEP-02, ADR-017). Read with employee.read — the
// iqama number only for govdata.read holders; change with govdata.update
// (Administrator, HR officer, GRO officer: a dependant is a sponsorship record,
// and family iqamas are GRO work). Staff ONLY: every route also asks scopeOf
// for the staff path, so a client manager or an employee is refused here
// whatever a future role grant might give them (client managers see nothing of
// a family; employees read their own on /me/dependants). Removal is a POST —
// nothing is deleted (soft removal; no role holds DELETE on the table).
@Controller('employees/:id/dependants')
export class DependantsController {
  constructor(
    private readonly dependants: DependantsService,
    private readonly employees: EmployeesService,
    private readonly policy: PolicyService,
  ) {}

  @RequirePermission('employee.read')
  @Get()
  async list(@Param('id') employeeId: string): Promise<DependantListResponse> {
    await this.sponsor(employeeId);
    const visible = this.identifierVisible();
    const rows = await this.dependants.listFor(employeeId);
    return { dependants: rows.map((d) => toDependantResponse(d, visible)) };
  }

  @RequirePermission('govdata.update')
  @Post()
  async add(@Param('id') employeeId: string, @Body() body: unknown): Promise<DependantResponse> {
    this.staffOnly();
    if (!UUID_RE.test(employeeId)) throw new NotFoundException('Employee not found');
    const parsed = createDependantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid dependant');
    const row = await this.dependants.add(employeeId, parsed.data);
    return toDependantResponse(row, this.identifierVisible());
  }

  @RequirePermission('govdata.update')
  @Patch(':dependantId')
  async update(
    @Param('id') employeeId: string,
    @Param('dependantId') dependantId: string,
    @Body() body: unknown,
  ): Promise<DependantResponse> {
    this.staffOnly();
    this.assertIds(employeeId, dependantId);
    const parsed = updateDependantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid dependant');
    const row = await this.dependants.update(employeeId, dependantId, parsed.data);
    return toDependantResponse(row, this.identifierVisible());
  }

  @RequirePermission('govdata.update')
  @Post(':dependantId/remove')
  @HttpCode(204)
  async remove(
    @Param('id') employeeId: string,
    @Param('dependantId') dependantId: string,
  ): Promise<void> {
    this.staffOnly();
    this.assertIds(employeeId, dependantId);
    await this.dependants.remove(employeeId, dependantId);
  }

  // scopeOf refuses employees and unknown principals (403); a client rep gets a
  // client scope, which is not this path either.
  private staffOnly(): void {
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('Dependants are not available to client accounts');
    }
  }

  private async sponsor(employeeId: string): Promise<void> {
    this.staffOnly();
    if (!UUID_RE.test(employeeId) || !(await this.employees.getById(employeeId))) {
      throw new NotFoundException('Employee not found');
    }
  }

  private assertIds(employeeId: string, dependantId: string): void {
    if (!UUID_RE.test(employeeId)) throw new NotFoundException('Employee not found');
    if (!UUID_RE.test(dependantId)) throw new NotFoundException('Dependant not found');
  }

  private identifierVisible(): boolean {
    return this.policy.can(requestContext.get()?.role, 'govdata.read');
  }
}
