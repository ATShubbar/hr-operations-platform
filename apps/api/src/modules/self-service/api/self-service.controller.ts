import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
import type {
  DownloadResponse,
  SelfDocumentListResponse,
  SelfProfileResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { DocumentsService, toSelfDocumentResponse } from '../../documents/public-api';
import { EmployeesService, toSelfProfileResponse } from '../../employees/public-api';
import { StorageService } from '../../storage/public-api';

const EMPLOYEE_SELF_SERVICE_FLAG = 'flag.employee-self-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Matches the client portal and the staff download (DOC-03 / PORTAL-03).
const SELF_DOWNLOAD_TTL_SECONDS = 300;

// "Me" — an employee's own file (SS-03, ADR-011).
//
// Three fences, in order:
//   1. `self-service.read` — held ONLY by the employee role (staff and client
//      reps are refused by the guard). Deliberately not `employee.read`: the
//      staff endpoints that check that name ignore the principal (ADR-011 rev. 2).
//   2. The employee id comes from the SESSION and the read goes through the
//      app_employee connection, so the database admits one row (SS-02).
//   3. The employee's company must have opted in (`flag.employee-self-service`,
//      per client, default off) — the employer decides.
@Controller('me')
export class SelfServiceController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
  ) {}

  @RequirePermission('self-service.read')
  @Get()
  async me(): Promise<SelfProfileResponse> {
    const record = await this.ownRecord();
    const company = await this.clients.getById(record.clientId);
    return toSelfProfileResponse(record, {
      ar: company?.nameAr ?? '',
      en: company?.nameEn ?? '',
    });
  }

  // My documents (SS-04): AVAILABLE ones only, soonest expiry first. The
  // database returns only this employee's documents (SS-02); the service adds
  // the available-only rule (never pending, quarantined or deleted).
  @RequirePermission('self-service.read')
  @Get('documents')
  async myDocuments(): Promise<SelfDocumentListResponse> {
    const record = await this.ownRecord();
    const rows = await this.documents.listForEmployee(record.id);
    return { documents: rows.map(toSelfDocumentResponse) };
  }

  // A short-lived link to one of my available documents. Anything else — a
  // colleague's, the company's, a pending/quarantined one, unknown or malformed
  // — is the SAME 404, so the response never confirms that a document exists.
  // The storage key comes from the fenced row, so the link cannot point at
  // anyone else's blob.
  @RequirePermission('self-service.read')
  @Get('documents/:id/download')
  async downloadMyDocument(@Param('id') id: string): Promise<DownloadResponse> {
    const record = await this.ownRecord();
    const doc = UUID_RE.test(id) ? await this.documents.getForEmployee(record.id, id) : null;
    if (!doc) throw new NotFoundException('Document not found');
    const url = await this.storage.presignDownload(doc.storageKey, SELF_DOWNLOAD_TTL_SECONDS);
    return { url, method: 'GET', expiresInSeconds: SELF_DOWNLOAD_TTL_SECONDS };
  }

  // The caller's own record, after every access rule. Shared by every /me route
  // (SS-04 documents, SS-05 requests) so none of them can skip a fence.
  private async ownRecord(): Promise<EmployeeRecord> {
    const ctx = requestContext.get();
    // Defence in depth: the guard already requires self-service.read, which only
    // the employee role holds — but a route must never run without its id.
    if (ctx?.principalType !== 'employee' || !ctx.employeeId) {
      throw new ForbiddenException('Self-service is for employee accounts');
    }
    const record = await this.employees.getSelf(ctx.employeeId);
    // The account points at a record the database no longer shows it — deleted,
    // or the binding is wrong. Either way there is nothing to serve.
    if (!record) throw new NotFoundException('Employee record not found');
    // The company is read FROM THE RECORD, per request (ADR-011 rev. 1): a
    // transferred employee is governed by their new employer's flag at once.
    if (!(await this.config.isEnabled(EMPLOYEE_SELF_SERVICE_FLAG, { clientId: record.clientId }))) {
      throw new ForbiddenException('Employee self-service is not enabled for this company');
    }
    // Backstop until SS-06 deactivates accounts on termination.
    if (record.employmentStatus === 'terminated') {
      throw new ForbiddenException('This employee record is terminated');
    }
    return record;
  }
}
