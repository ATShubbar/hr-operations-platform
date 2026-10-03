import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
import type { EmployeeHistoryEntry, EmployeeHistoryResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { AuditQueryService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { RequestsService } from '../../requests/public-api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 100;

// GET /requests/:id/history (DS-08) — a request's decision trail: created,
// edited, processed (status + assignee changes), newest first. The same curated
// shape and rules as a person's history (AUDIT-06): what happened, by whom,
// when — never the audit snapshots. STAFF ONLY; any staff role that reads
// requests (`request.read`) reads its trail. Entries written before AUDIT-06's
// record id reached requests (DS-08) are not included.
@Controller('requests')
export class RequestHistoryController {
  constructor(
    private readonly requests: RequestsService,
    private readonly audit: AuditQueryService,
    private readonly users: UsersService,
  ) {}

  @RequirePermission('request.read')
  @Get(':id/history')
  async history(@Param('id') id: string): Promise<EmployeeHistoryResponse> {
    if (scopeOf(requestContext.get()).kind !== 'staff') throw new ForbiddenException('Staff only');
    if (!UUID_RE.test(id) || !(await this.requests.findById(id))) {
      throw new NotFoundException('Request not found');
    }
    const rows = await this.audit.forRecords([{ resource: 'request', ids: [id] }], LIMIT + 1);
    const page = rows.slice(0, LIMIT);
    const names = await this.users.displayNames(
      page.map((r) => r.actorId).filter((a): a is string => !!a),
    );
    const entries: EmployeeHistoryEntry[] = page.map((r) => ({
      id: r.id,
      at: r.at,
      resource: 'request',
      action: r.action,
      actor: r.actorId
        ? { name: names.get(r.actorId) ?? null, role: r.actorRole }
        : r.actorRole
          ? { name: null, role: r.actorRole }
          : null,
      subject: null,
    }));
    return { entries, truncated: rows.length > LIMIT };
  }
}
