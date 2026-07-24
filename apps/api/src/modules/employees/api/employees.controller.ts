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
  createEmployeeRequestSchema,
  updateEmployeeCoreRequestSchema,
  updateGovdataRequestSchema,
  updateSalaryRequestSchema,
  type EmployeeListResponse,
  type EmployeeResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { PolicyService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { EmployeesService } from '../application/employees.service';
import { toEmployeeResponse, type EmployeeVisibility } from '../domain/employee-view';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Employees API with FIELD-LEVEL authorization (EMP-02). The employee endpoint
// is gated by employee.* ; the salary/govdata field groups are gated
// SEPARATELY — reads redact them per salary.read/govdata.read, and each group's
// write is its own sub-resource endpoint (salary.update / govdata.update).
// Staff, cross-client; the client-rep read-own path is deferred to the portal.
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly clients: ClientsService,
    private readonly policy: PolicyService,
  ) {}

  // ---- reads (redacted per capability) ----

  @RequirePermission('employee.read')
  @Get()
  async list(@Query('clientId') clientId?: string): Promise<EmployeeListResponse> {
    if (clientId !== undefined && !UUID_RE.test(clientId)) {
      throw new BadRequestException('Invalid clientId');
    }
    const rows = await this.employees.list(clientId);
    const view = this.readVisibility();
    return { employees: rows.map((r) => toEmployeeResponse(r, view)) };
  }

  @RequirePermission('employee.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<EmployeeResponse> {
    return toEmployeeResponse(await this.require(id), this.readVisibility());
  }

  // ---- create (core; salary/govdata inline-gated by their update caps) ----

  @RequirePermission('employee.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<EmployeeResponse> {
    const parsed = createEmployeeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid employee payload');
    const req = parsed.data;

    const role = requestContext.get()?.role;
    if (req.salary && !this.policy.can(role, 'salary.update')) {
      throw new ForbiddenException('salary.update required to set salary');
    }
    if (req.govdata && !this.policy.can(role, 'govdata.update')) {
      throw new ForbiddenException('govdata.update required to set government data');
    }
    if (!(await this.clients.getById(req.clientId))) {
      throw new BadRequestException('Unknown client');
    }

    const data: Prisma.EmployeeUncheckedCreateInput = {
      clientId: req.clientId,
      nameAr: req.name.ar,
      nameEn: req.name.en,
      nationality: req.nationality,
      contractType: req.contractType,
      gender: req.gender,
      dateOfBirth: req.dateOfBirth,
      jobTitleAr: req.jobTitleAr,
      jobTitleEn: req.jobTitleEn,
      department: req.department,
      hireDate: req.hireDate,
      employmentStatus: req.employmentStatus,
      contractEndDate: req.contractEndDate,
      countsTowardSaudization: req.countsTowardSaudization,
      ...(req.salary ?? {}),
      ...(req.govdata ?? {}),
    };
    const row = await this.employees.create(data);
    return toEmployeeResponse(row, this.readVisibility());
  }

  // ---- writes, one endpoint per field group (its own permission) ----

  @RequirePermission('employee.update')
  @Patch(':id')
  async updateCore(@Param('id') id: string, @Body() body: unknown): Promise<EmployeeResponse> {
    this.assertUuid(id);
    const parsed = updateEmployeeCoreRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid employee payload');
    const { name, ...rest } = parsed.data;
    const data: Prisma.EmployeeUncheckedUpdateInput = {
      ...rest,
      ...(name ? { nameAr: name.ar, nameEn: name.en } : {}),
    };
    return this.applyUpdate(id, data, 'update');
  }

  @RequirePermission('salary.update')
  @Patch(':id/salary')
  async updateSalary(@Param('id') id: string, @Body() body: unknown): Promise<EmployeeResponse> {
    this.assertUuid(id);
    const parsed = updateSalaryRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid salary payload');
    return this.applyUpdate(id, parsed.data, 'salary-update');
  }

  @RequirePermission('govdata.update')
  @Patch(':id/govdata')
  async updateGovdata(@Param('id') id: string, @Body() body: unknown): Promise<EmployeeResponse> {
    this.assertUuid(id);
    const parsed = updateGovdataRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid govdata payload');
    return this.applyUpdate(id, parsed.data, 'govdata-update');
  }

  @RequirePermission('employee.delete')
  @Delete(':id')
  async terminate(@Param('id') id: string): Promise<EmployeeResponse> {
    this.assertUuid(id);
    return this.applyUpdate(id, { employmentStatus: 'terminated' }, 'terminate');
  }

  // ---- helpers ----

  private async applyUpdate(
    id: string,
    data: Prisma.EmployeeUncheckedUpdateInput,
    action: string,
  ): Promise<EmployeeResponse> {
    const row = await this.employees.update(id, data, action);
    if (!row) throw new NotFoundException('Employee not found');
    return toEmployeeResponse(row, this.readVisibility());
  }

  private readVisibility(): EmployeeVisibility {
    const role = requestContext.get()?.role;
    return {
      salary: this.policy.can(role, 'salary.read'),
      // Staff see full govdata; the status-only tier is for the client-rep
      // portal path (deferred), so here it is full-or-none.
      govdata: this.policy.can(role, 'govdata.read') ? 'full' : 'none',
    };
  }

  private async require(id: string): Promise<EmployeeRecord> {
    this.assertUuid(id);
    const row = await this.employees.getById(id);
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  private assertUuid(id: string): void {
    if (!UUID_RE.test(id)) throw new NotFoundException('Employee not found');
  }
}
