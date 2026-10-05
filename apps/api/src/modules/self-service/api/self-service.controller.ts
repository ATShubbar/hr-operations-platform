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
  Post,
} from '@nestjs/common';
import {
  createRequestAttachmentSchema,
  createRequestCommentSchema,
  createSelfLeaveRequestSchema,
  createSelfRequestRequestSchema,
  type EmployeeLeaveResponse,
  type LeaveListResponse,
  type RequestAttachment,
  type RequestAttachmentListResponse,
  type RequestAttachmentUploadResponse,
  type RequestComment,
  type RequestCommentListResponse,
  type LeaveResponse,
  type DownloadResponse,
  type SelfDocumentListResponse,
  type SelfProfileResponse,
  type SelfRequestListResponse,
  type SelfRequestResponse,
  type SelfDependantListResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { DocumentsService, toSelfDocumentResponse } from '../../documents/public-api';
import {
  DependantsService,
  EmployeesService,
  toSelfDependant,
  toSelfProfileResponse,
} from '../../employees/public-api';
import { LeaveBalanceService, LeavePresenter, LeaveService } from '../../leave/public-api';
import {
  ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  INVALID_ATTACHMENT,
  RequestAttachmentsService,
  RequestThreadService,
  RequestsService,
  ServiceLevelService,
  toSelfRequestResponse,
} from '../../requests/public-api';
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
    private readonly dependants: DependantsService,
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    private readonly requests: RequestsService,
    private readonly leave: LeaveService,
    private readonly presentLeave: LeavePresenter,
    private readonly leaveBalances: LeaveBalanceService,
    private readonly thread: RequestThreadService,
    private readonly attachments: RequestAttachmentsService,
    private readonly sla: ServiceLevelService,
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

  // My family (DEP-02, ADR-017): the dependants on my sponsorship, numbers
  // included (one's own identifiers — ADR-011), read through app_employee so the
  // DATABASE decides whose rows exist; removed ones are left out. Same gates as
  // the rest of /me: the company's switch, a live record.
  @RequirePermission('self-service.read')
  @Get('dependants')
  async myDependants(): Promise<SelfDependantListResponse> {
    const record = await this.ownRecord();
    const rows = await this.dependants.listForSelf(record.id);
    return { dependants: rows.map(toSelfDependant) };
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

  // My requests (SS-05): the ones I raised, newest first. The database returns
  // only those (employee_own_read) — not my client rep's, not a colleague's.
  @RequirePermission('self-service.read')
  @Get('requests')
  async myRequests(): Promise<SelfRequestListResponse> {
    const record = await this.ownRecord();
    const rows = await this.requests.listForEmployee(record.id);
    const days = await this.sla.days();
    return { requests: rows.map((r) => toSelfRequestResponse(r, days[r.type])) };
  }

  // Raise a request (SS-05) — the first thing an employee WRITES, so it has its
  // own verb, `self-service.create`. What may be written is fixed by the schema
  // below AND by the database (employee_raise). The employee picks type/title/description; the company
  // is their own record's, and status/priority/due date/assignee keep their
  // defaults. Audited, and it fires RequestCreated (Tasks spawns its item).
  @RequirePermission('self-service.create')
  @Post('requests')
  async raiseRequest(@Body() body: unknown): Promise<SelfRequestResponse> {
    const record = await this.ownRecord();
    const parsed = createSelfRequestRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request payload');
    const actorId = requestContext.get()?.actorId;
    if (!actorId) throw new ForbiddenException('No session actor');
    const row = await this.requests.createForEmployee(record.id, record.clientId, {
      ...parsed.data,
      createdByUserId: actorId,
    });
    return toSelfRequestResponse(row, (await this.sla.days())[row.type]);
  }

  // One request I raised (THREAD-01): the detail My requests opens. Anything
  // else — a colleague's, another company's, unknown — is the same 404.
  @RequirePermission('self-service.read')
  @Get('requests/:id')
  async myRequest(@Param('id') id: string): Promise<SelfRequestResponse> {
    const record = await this.ownRecord();
    const row = UUID_RE.test(id) ? await this.requests.findForEmployee(record.id, id) : null;
    if (!row) throw new NotFoundException('Request not found');
    return toSelfRequestResponse(row, (await this.sla.days())[row.type]);
  }

  // The thread on a request I raised (ADR-016): read, and add to it.
  @RequirePermission('self-service.read')
  @Get('requests/:id/comments')
  async myRequestComments(@Param('id') id: string): Promise<RequestCommentListResponse> {
    const record = await this.ownRecord();
    const rows = UUID_RE.test(id) ? await this.thread.listForEmployee(record.id, id) : null;
    if (!rows) throw new NotFoundException('Request not found');
    return { comments: rows };
  }

  @RequirePermission('self-service.create')
  @Post('requests/:id/comments')
  @HttpCode(201)
  async addMyRequestComment(@Param('id') id: string, @Body() body: unknown): Promise<RequestComment> {
    const record = await this.ownRecord();
    const parsed = createRequestCommentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('A comment needs 1 to 4000 characters');
    const row = UUID_RE.test(id) ? await this.thread.addForEmployee(record.id, id, parsed.data.body) : null;
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }

  // Files on a request I raised (ADR-016, THREAD-02): the same service and
  // rules as the staff/client routes, on my own fenced connection. A request or
  // file that isn't mine to see is the same 404.
  @RequirePermission('self-service.read')
  @Get('requests/:id/attachments')
  async myRequestAttachments(@Param('id') id: string): Promise<RequestAttachmentListResponse> {
    const path = await this.myPath();
    const rows = UUID_RE.test(id) ? await this.attachments.list(path, id) : null;
    if (!rows) throw new NotFoundException('Request not found');
    return { attachments: rows };
  }

  @RequirePermission('self-service.create')
  @Post('requests/:id/attachments')
  @HttpCode(201)
  async addMyRequestAttachment(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RequestAttachmentUploadResponse> {
    const path = await this.myPath();
    const parsed = createRequestAttachmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(INVALID_ATTACHMENT);
    const issued = UUID_RE.test(id) ? await this.attachments.create(path, id, parsed.data) : null;
    if (!issued) throw new NotFoundException('Request not found');
    return issued;
  }

  @RequirePermission('self-service.create')
  @Post('requests/:id/attachments/:fileId/confirm')
  @HttpCode(200)
  async confirmMyRequestAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ): Promise<RequestAttachment> {
    const path = await this.myPath();
    const row = UUID_RE.test(id) && UUID_RE.test(fileId) ? await this.attachments.confirm(path, id, fileId) : null;
    if (!row) throw new NotFoundException('File not found');
    return row;
  }

  @RequirePermission('self-service.read')
  @Get('requests/:id/attachments/:fileId/download')
  async downloadMyRequestAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ): Promise<DownloadResponse> {
    const path = await this.myPath();
    const url = UUID_RE.test(id) && UUID_RE.test(fileId) ? await this.attachments.download(path, id, fileId) : null;
    if (!url) throw new NotFoundException('File not found');
    return { url, method: 'GET', expiresInSeconds: ATTACHMENT_DOWNLOAD_TTL_SECONDS };
  }

  @RequirePermission('self-service.create')
  @Delete('requests/:id/attachments/:fileId')
  async removeMyRequestAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ): Promise<RequestAttachment> {
    const path = await this.myPath();
    const row = UUID_RE.test(id) && UUID_RE.test(fileId) ? await this.attachments.remove(path, id, fileId) : null;
    if (!row) throw new NotFoundException('File not found');
    return row;
  }

  // My leave (ADR-014, LEAVE-02): every leave request ABOUT me — mine and those
  // my manager or PEOPLE&GRO raised for me — newest first. The database returns
  // only my rows (employee_self).
  @RequirePermission('self-service.read')
  @Get('leave')
  async myLeave(): Promise<LeaveListResponse> {
    const record = await this.ownRecord();
    return { leave: await this.presentLeave.many(await this.leave.listForEmployee(record.id)) };
  }

  // My annual-leave balance and history (LEAVE-03), through my own fenced path.
  @RequirePermission('self-service.read')
  @Get('leave/balance')
  async myLeaveBalance(): Promise<EmployeeLeaveResponse> {
    const record = await this.ownRecord();
    const mine = await this.leaveBalances.mine(record.id);
    if (!mine) throw new NotFoundException('Employee record not found');
    return mine;
  }

  // Raise leave for myself. The employee id and company come from MY record;
  // `.strict()` rejects an employee id in the body. The statutory rules (caps,
  // Hajj once) are the service's; the database refuses anything but a pending,
  // undecided request for me (employee_raise).
  @RequirePermission('self-service.create')
  @Post('leave')
  @HttpCode(201)
  async raiseLeave(@Body() body: unknown): Promise<LeaveResponse> {
    const record = await this.ownRecord();
    const parsed = createSelfLeaveRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid leave request');
    const row = await this.leave.raiseForEmployee(record.id, record.clientId, parsed.data);
    return this.presentLeave.one(row);
  }

  // Withdraw a PENDING request I raised myself (one raised for me is not mine to
  // withdraw → 403). Anything not mine at all is the same 404.
  @RequirePermission('self-service.create')
  @Post('leave/:id/withdraw')
  @HttpCode(200)
  async withdrawLeave(@Param('id') id: string): Promise<LeaveResponse> {
    const record = await this.ownRecord();
    const row = UUID_RE.test(id) ? await this.leave.withdrawForEmployee(record.id, id) : null;
    if (!row) throw new NotFoundException('Leave request not found');
    return this.presentLeave.one(row);
  }

  // The caller's own record, after every access rule. Shared by every /me route
  // (SS-04 documents, SS-05 requests) so none of them can skip a fence.
  // My own fenced path — the employee id comes from my record (the session), never input.
  private async myPath(): Promise<{ kind: 'employee'; employeeId: string }> {
    return { kind: 'employee', employeeId: (await this.ownRecord()).id };
  }

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
