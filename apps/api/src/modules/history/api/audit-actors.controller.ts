import { BadRequestException, Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { auditActorsQuerySchema, type AuditActorsResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { AuditQueryService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';

// GET /audit/actors?ids= (AUDIT-09) — who the actors of a page of the Audit
// trail are. The page named staff from the staff directory and showed anyone
// else (a client manager, an employee) as an id fragment.
//
// The answer is deliberately small: the id and the display name — never the
// email, role or status (the entry already carries the role it was written
// with). And it is not a way to look up any account: only ids that APPEAR IN
// THE TRAIL as an actor are answered, so a reader learns nothing the trail does
// not already show them. An account that no longer exists is simply absent.
//
// For the readers of the trail (`audit.read`: Administrator, Auditor), staff
// only. Lives in History for the same reason the export does: Audit, a
// foundation module, may not import Auth.
@Controller('audit')
export class AuditActorsController {
  constructor(
    private readonly audit: AuditQueryService,
    private readonly users: UsersService,
  ) {}

  @RequirePermission('audit.read')
  @Get('actors')
  async actors(@Query() query: unknown): Promise<AuditActorsResponse> {
    if (scopeOf(requestContext.get()).kind !== 'staff') throw new ForbiddenException('Staff only');
    const parsed = auditActorsQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid actor ids');

    const acted = await this.audit.actorsAmong(parsed.data.ids);
    const names = await this.users.displayNames(acted);
    return {
      actors: acted
        .filter((id) => names.has(id))
        .map((id) => ({ id, name: names.get(id) ?? null })),
    };
  }
}
