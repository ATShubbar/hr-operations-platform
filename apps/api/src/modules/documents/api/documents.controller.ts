import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  createDocumentRequestSchema,
  documentQuerySchema,
  legalHoldRequestSchema,
  type DocumentListResponse,
  type DocumentResponse,
  type DownloadResponse,
  type UploadIssueResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { DocumentModel as DocumentRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { StorageService } from '../../storage/public-api';
import { DocumentsService } from '../application/documents.service';
import { canWriteCategory } from '../domain/document-policy';
import { DOCUMENT_SCANNER, type DocumentScanner } from '../domain/scanner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_TTL_SECONDS = 900;
const DOWNLOAD_TTL_SECONDS = 300;

// Documents upload flow (DOC-02). Presigned, two-step, direct-to-store: the API
// issues a pending metadata row + a short-lived PUT URL; the client transfers
// bytes straight to object storage; confirm marks it available once the blob is
// verified present. `document.upload` gates both; category-scope (recruiter →
// recruitment, GRO → gov, admin/HR → all) is checked in-handler per the matrix.
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly clients: ClientsService,
    private readonly storage: StorageService,
    @Inject(DOCUMENT_SCANNER) private readonly scanner: DocumentScanner,
  ) {}

  @RequirePermission('document.upload')
  @Post()
  @HttpCode(201)
  async issue(@Body() body: unknown): Promise<UploadIssueResponse> {
    const parsed = createDocumentRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid document payload');
    const req = parsed.data;

    const role = requestContext.get()?.role;
    if (!canWriteCategory(role, req.category)) {
      throw new ForbiddenException(`Your role may not upload '${req.category}' documents`);
    }
    if (!(await this.clients.getById(req.clientId))) {
      throw new BadRequestException('Unknown client');
    }

    const doc = await this.documents.create({
      clientId: req.clientId,
      category: req.category,
      title: req.title,
      fileName: req.fileName,
      contentType: req.contentType,
      sizeBytes: req.sizeBytes,
      issueDate: req.issueDate,
      expiryDate: req.expiryDate,
      employeeId: req.employeeId,
      uploadedByUserId: requestContext.get()?.actorId ?? undefined,
      status: 'pending',
    });

    const url = await this.storage.presignUpload(doc.storageKey, doc.contentType, UPLOAD_TTL_SECONDS);
    return {
      document: toResponse(doc),
      upload: {
        url,
        method: 'PUT',
        headers: { 'Content-Type': doc.contentType },
        expiresInSeconds: UPLOAD_TTL_SECONDS,
      },
    };
  }

  @RequirePermission('document.upload')
  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(@Param('id') id: string): Promise<DocumentResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Document not found');
    const doc = await this.documents.getById(id);
    if (!doc) throw new NotFoundException('Document not found');

    // The blob must actually be in the store before we mark the record available
    // — otherwise a caller could confirm an upload that never happened.
    const stat = await this.storage.statObject(doc.storageKey);
    if (!stat) throw new BadRequestException('Upload not found in storage');

    // Virus scan (DOC-04) — between upload and `available`. An infected blob is
    // removed and the record quarantined (never served).
    const scan = await this.scanner.scan(await this.storage.getObject(doc.storageKey));
    if (!scan.clean) {
      await this.storage.deleteObject(doc.storageKey);
      const quarantined = await this.documents.quarantine(id);
      if (!quarantined) throw new NotFoundException('Document not found');
      return toResponse(quarantined);
    }

    const updated = await this.documents.confirm(id, stat.size);
    if (!updated) throw new NotFoundException('Document not found');
    return toResponse(updated);
  }

  // ---- reads (DOC-03) ----

  @RequirePermission('document.read')
  @Get()
  async list(@Query() query: unknown): Promise<DocumentListResponse> {
    const parsed = documentQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid document query');
    const rows = await this.documents.find(parsed.data);
    return { documents: rows.map(toResponse) };
  }

  @RequirePermission('document.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<DocumentResponse> {
    return toResponse(await this.require(id));
  }

  // A short-lived GET URL for the blob. Only an AVAILABLE document is
  // downloadable — pending has no blob yet, deleted/quarantined have none to
  // serve → 409.
  @RequirePermission('document.read')
  @Get(':id/download')
  async download(@Param('id') id: string): Promise<DownloadResponse> {
    const doc = await this.require(id);
    if (doc.status !== 'available') {
      throw new ConflictException(`Document is '${doc.status}', not downloadable`);
    }
    const url = await this.storage.presignDownload(doc.storageKey, DOWNLOAD_TTL_SECONDS);
    return { url, method: 'GET', expiresInSeconds: DOWNLOAD_TTL_SECONDS };
  }

  // ---- delete (DOC-03) ----

  @RequirePermission('document.delete')
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<DocumentResponse> {
    const doc = await this.require(id);
    const role = requestContext.get()?.role;
    if (!canWriteCategory(role, doc.category)) {
      throw new ForbiddenException(`Your role may not delete '${doc.category}' documents`);
    }
    // Retention (DOC-04): a document under legal hold cannot be deleted.
    if (doc.legalHold) {
      throw new ConflictException('Document is under legal hold and cannot be deleted');
    }
    // Remove the blob first (idempotent), then soft-delete the record — the
    // metadata row survives for audit/retention, but the PII blob is gone.
    await this.storage.deleteObject(doc.storageKey);
    const updated = await this.documents.softDelete(id);
    if (!updated) throw new NotFoundException('Document not found');
    return toResponse(updated);
  }

  // ---- legal hold (DOC-04 retention/PDPL) ----

  @RequirePermission('document.delete')
  @Post(':id/legal-hold')
  @HttpCode(200)
  async legalHold(@Param('id') id: string, @Body() body: unknown): Promise<DocumentResponse> {
    await this.require(id);
    const parsed = legalHoldRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid payload (expected { held })');
    const updated = await this.documents.setLegalHold(id, parsed.data.held);
    if (!updated) throw new NotFoundException('Document not found');
    return toResponse(updated);
  }

  private async require(id: string): Promise<DocumentRecord> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Document not found');
    const doc = await this.documents.getById(id);
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toResponse(d: DocumentRecord): DocumentResponse {
  return {
    id: d.id,
    clientId: d.clientId,
    category: d.category,
    title: d.title,
    fileName: d.fileName,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    legalHold: d.legalHold,
    issueDate: iso(d.issueDate),
    expiryDate: iso(d.expiryDate),
    employeeId: d.employeeId,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
