import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
import type { EmployeeHistoryEntry, EmployeeHistoryResponse, HistoryResource } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { AuditQueryService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { DocumentsService } from '../../documents/public-api';
import { EmployeesService } from '../../employees/public-api';
import { GroProcessesService } from '../../gro/public-api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// One page of history. The Person record shows the most recent; `truncated`
// says when there is more (paging arrives if a record ever needs it).
const LIMIT = 100;

// GET /employees/:id/history (AUDIT-06) — one person's history: their record,
// their self-service account, their documents (deleted ones included) and their
// GRO processes, newest first.
//
// STAFF ONLY and gated by `employee.history`, the curated capability every staff
// role holds. What it returns is curated on purpose: action, which record, the
// actor's NAME and role, and when — never the audit snapshots (before/after),
// which stay behind audit.read. Entries written before AUDIT-06 carry no record
// id and are not included; none is guessed.
@Controller('employees')
export class EmployeeHistoryController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly documents: DocumentsService,
    private readonly gro: GroProcessesService,
    private readonly audit: AuditQueryService,
    private readonly users: UsersService,
  ) {}

  @RequirePermission('employee.history')
  @Get(':id/history')
  async history(@Param('id') id: string): Promise<EmployeeHistoryResponse> {
    if (scopeOf(requestContext.get()).kind !== 'staff') throw new ForbiddenException('Staff only');
    if (!UUID_RE.test(id) || !(await this.employees.getById(id))) {
      throw new NotFoundException('Employee not found');
    }

    const [docs, processes] = await Promise.all([
      this.documents.allForEmployee(id),
      this.gro.list({ employeeId: id }),
    ]);
    const docById = new Map(docs.map((d) => [d.id, d]));
    const procById = new Map(processes.map((p) => [p.id, p]));

    // One extra row decides whether more exists.
    const rows = await this.audit.forRecords(
      [
        { resource: 'employee', ids: [id] },
        { resource: 'employee-user', ids: [id] },
        { resource: 'document', ids: docs.map((d) => d.id) },
        { resource: 'gro-process', ids: processes.map((p) => p.id) },
      ],
      LIMIT + 1,
    );
    const page = rows.slice(0, LIMIT);
    const names = await this.users.displayNames(
      page.map((r) => r.actorId).filter((a): a is string => !!a),
    );

    const entries: EmployeeHistoryEntry[] = page.map((r) => {
      const doc = r.resource === 'document' ? docById.get(r.resourceId) : undefined;
      const proc = r.resource === 'gro-process' ? procById.get(r.resourceId) : undefined;
      return {
        id: r.id,
        at: r.at,
        resource: r.resource as HistoryResource,
        action: r.action,
        actor: r.actorId
          ? { name: names.get(r.actorId) ?? null, role: r.actorRole }
          : r.actorRole
            ? { name: null, role: r.actorRole }
            : null,
        subject: doc
          ? { kind: 'document', title: doc.title, category: doc.category }
          : proc
            ? { kind: 'gro-process', type: proc.type }
            : null,
      };
    });
    return { entries, truncated: rows.length > LIMIT };
  }
}
