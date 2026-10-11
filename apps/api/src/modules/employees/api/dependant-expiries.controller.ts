import { BadRequestException, Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { dependantExpiryQuerySchema, type DependantExpiryListResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { DependantsService } from '../application/dependants.service';
import { EmployeesService } from '../application/employees.service';
import { toDependantExpiry } from '../domain/dependant-view';

// GET /dependants/expiries (DEP-05a, ADR-017 rev. 1) — every CURRENT dependant's
// three expiry dates in one read, so the runway and the "expiring" figures can
// count them (they could only be read one sponsor at a time before).
//
// Read with employee.read, like a sponsor's own dependant list, and STAFF ONLY:
// scopeOf refuses an employee, and a client manager's scope is not the staff
// path — a family is not the employer's business (ADR-017), whatever a future
// role grant might say. It returns dates and the sponsor's id, nothing that
// identifies a dependant; which sponsors are "under management" is the reader's
// rule to apply (the screens already hold the employee list).
@Controller('dependants')
export class DependantExpiriesController {
  constructor(
    private readonly dependants: DependantsService,
    private readonly employees: EmployeesService,
  ) {}

  @RequirePermission('employee.read')
  @Get('expiries')
  async expiries(@Query() query: unknown): Promise<DependantExpiryListResponse> {
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('Dependants are not available to client accounts');
    }
    const parsed = dependantExpiryQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid query');
    const sponsors = await this.employees.list(parsed.data.clientId);
    const rows = await this.dependants.listForEmployees(sponsors.map((e) => e.id));
    return { dependants: rows.map(toDependantExpiry) };
  }
}
