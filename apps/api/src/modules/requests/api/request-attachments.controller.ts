import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  createRequestAttachmentSchema,
  type DownloadResponse,
  type RequestAttachment,
  type RequestAttachmentListResponse,
  type RequestAttachmentUploadResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import {
  RequestAttachmentsService,
  type AttachmentPath,
} from '../application/request-attachments.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ATTACHMENT_DOWNLOAD_TTL_SECONDS = 300;
export const INVALID_ATTACHMENT = 'Attach a PDF, JPG or PNG of up to 10 MB';

// Files on a request's thread (ADR-016, THREAD-02) — staff cross-client and a
// client manager on their own company (scopeOf: anyone else 403). Read with the
// request (request.read — the Auditor included); upload, confirm and remove with
// request.comment. A request or file the caller can't see is 404. Employees use
// the same service under /me/requests/:id/attachments (self-service).
@Controller('requests/:id/attachments')
export class RequestAttachmentsController {
  constructor(private readonly attachments: RequestAttachmentsService) {}

  @RequirePermission('request.read')
  @Get()
  async list(@Param('id') id: string): Promise<RequestAttachmentListResponse> {
    const rows = UUID_RE.test(id) ? await this.attachments.list(this.path(), id) : null;
    if (!rows) throw new NotFoundException('Request not found');
    return { attachments: rows };
  }

  @RequirePermission('request.comment')
  @Post()
  @HttpCode(201)
  async create(@Param('id') id: string, @Body() body: unknown): Promise<RequestAttachmentUploadResponse> {
    const parsed = createRequestAttachmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(INVALID_ATTACHMENT);
    const issued = UUID_RE.test(id) ? await this.attachments.create(this.path(), id, parsed.data) : null;
    if (!issued) throw new NotFoundException('Request not found');
    return issued;
  }

  @RequirePermission('request.comment')
  @Post(':fileId/confirm')
  @HttpCode(200)
  async confirm(@Param('id') id: string, @Param('fileId') fileId: string): Promise<RequestAttachment> {
    const row = ids(id, fileId) ? await this.attachments.confirm(this.path(), id, fileId) : null;
    if (!row) throw new NotFoundException('File not found');
    return row;
  }

  @RequirePermission('request.read')
  @Get(':fileId/download')
  async download(@Param('id') id: string, @Param('fileId') fileId: string): Promise<DownloadResponse> {
    const url = ids(id, fileId) ? await this.attachments.download(this.path(), id, fileId) : null;
    if (!url) throw new NotFoundException('File not found');
    return { url, method: 'GET', expiresInSeconds: ATTACHMENT_DOWNLOAD_TTL_SECONDS };
  }

  @RequirePermission('request.comment')
  @Delete(':fileId')
  async remove(@Param('id') id: string, @Param('fileId') fileId: string): Promise<RequestAttachment> {
    const row = ids(id, fileId) ? await this.attachments.remove(this.path(), id, fileId) : null;
    if (!row) throw new NotFoundException('File not found');
    return row;
  }

  private path(): AttachmentPath {
    return scopeOf(requestContext.get());
  }
}

function ids(id: string, fileId: string): boolean {
  return UUID_RE.test(id) && UUID_RE.test(fileId);
}
