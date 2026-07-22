import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  createDocumentRequestSchema,
  type DocumentResponse,
  type UploadIssueResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { DocumentModel as DocumentRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { StorageService } from '../../storage/public-api';
import { DocumentsService } from '../application/documents.service';
import { canWriteCategory } from '../domain/document-policy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_TTL_SECONDS = 900;

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

    const updated = await this.documents.confirm(id, stat.size);
    if (!updated) throw new NotFoundException('Document not found');
    return toResponse(updated);
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
    issueDate: iso(d.issueDate),
    expiryDate: iso(d.expiryDate),
    employeeId: d.employeeId,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
