import { BadRequestException, Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import {
  auditActorsQuerySchema,
  type AuditActorsResponse,
  type AuditNonStaffActorsResponse,
} from '@hr/contracts';
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

  // GET /audit/actors/non-staff (AUDIT-13) — the Actor filter's other half. The
  // staff directory lists staff; this lists the client managers and employees
  // who appear in the trail, so the trail can be narrowed to one of them. The
  // same readers, the same small answer (plus which kind of account), and again
  // only accounts that acted — an account that still exists; a deleted one has
  // no name to offer and is found by reading the trail.
  @RequirePermission('audit.read')
  @Get('actors/non-staff')
  async nonStaff(): Promise<AuditNonStaffActorsResponse> {
    if (scopeOf(requestContext.get()).kind !== 'staff') throw new ForbiddenException('Staff only');
    const principals = await this.users.principals(await this.audit.actorIds());
    const actors: AuditNonStaffActorsResponse['actors'] = [];
    for (const [id, who] of principals) {
      if (who.kind === 'staff') continue;
      actors.push({ id, name: who.name, kind: who.kind });
    }
    actors.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id));
    return { actors };
  }
}
