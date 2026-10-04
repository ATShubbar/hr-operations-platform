import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  REQUEST_ATTACHMENT_MAX_BYTES,
  REQUEST_ATTACHMENT_MAX_FILES,
  type CreateRequestAttachment,
  type RequestAttachment,
  type RequestAttachmentUploadResponse,
} from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import { requestContext } from '../../../context/request-context';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  RequestAttachmentModel as AttachmentRecord,
  RequestModel as RequestRecord,
} from '../../../generated/prisma/models';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { EventBus } from '../../events/public-api';
import { FILE_SCANNER, StorageService, type FileScanner } from '../../storage/public-api';
import { matchesSignature } from '../domain/file-signature';
import { RequestAttachmentAddedEvent } from '../domain/request-attachment-added.event';
import { returnIfWaiting } from './requester-reply';

type Tx = Prisma.TransactionClient;

// Which fenced connection a call runs on — the SAME three paths as requests
// (ADR-016): staff cross-client; a client manager on their company (RLS on
// app.client_id); an employee on requests they raised (RLS on app.employee_id).
export type AttachmentPath =
  | { kind: 'staff' }
  | { kind: 'client'; clientId: string }
  | { kind: 'employee'; employeeId: string };

const UPLOAD_TTL_SECONDS = 900;
// Kept in step with the controllers' expiresInSeconds.
const DOWNLOAD_TTL_SECONDS = 300;
// An upload still in progress holds its slot (towards the 20) this long — the
// life of its upload link — then stops counting if it never arrived.
const PENDING_HOLD_MS = UPLOAD_TTL_SECONDS * 1000;

// Files on a request's thread (ADR-016, THREAD-02). Uploaded browser → storage
// directly, then CONFIRMED: the blob must have landed, be ≤ 10 MB, pass the
// virus check (Storage's FILE_SCANNER) and really be the PDF/JPG/PNG it
// claimed — only then is it `available` and the other side told. Everyone on
// the request sees available and removed files; one still being checked, or one
// the check refused, only its uploader. Only the uploader confirms or removes
// (removal is soft). The database fences each path and the legal moves; this
// service adds "only the uploader", which needs the actor.
@Injectable()
export class RequestAttachmentsService {
  private readonly logger = new Logger(RequestAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly employeeDb: EmployeeScopedPrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly events: EventBus,
    private readonly storage: StorageService,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
  ) {}

  // ---- reads ---------------------------------------------------------------

  /** The thread's files the caller may see, oldest first; null when the request is not theirs to see. */
  async list(path: AttachmentPath, requestId: string): Promise<RequestAttachment[] | null> {
    const me = this.actor();
    const rows = await this.run(path, async (tx) => {
      if (!(await this.findRequest(tx, requestId))) return null;
      return tx.requestAttachment.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } });
    });
    if (!rows) return null;
    return this.present(rows.filter((r) => visibleTo(r, me)));
  }

  /** A short-lived link to an available file. null when the file isn't the caller's to see (→ 404). */
  async download(path: AttachmentPath, requestId: string, fileId: string): Promise<string | null> {
    const row = await this.run(path, (tx) => this.findFile(tx, requestId, fileId));
    if (!row || !visibleTo(row, this.actor())) return null;
    if (row.status !== 'available') throw new ConflictException(`This file is ${row.status}, not downloadable`);
    return this.storage.presignDownload(row.storageKey, DOWNLOAD_TTL_SECONDS, row.fileName);
  }

  // ---- writes --------------------------------------------------------------

  /** Step 1: a pending row and its upload link. null when the request is not the caller's to see. */
  async create(
    path: AttachmentPath,
    requestId: string,
    input: CreateRequestAttachment,
  ): Promise<RequestAttachmentUploadResponse | null> {
    const actor = this.actor();
    const row = await this.run(path, async (tx) => {
      const request = await this.findRequest(tx, requestId);
      if (!request) return null;
      // One upload at a time per request decides the 20th slot (a lock any
      // role may take; released at commit).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`;
      const held = await tx.requestAttachment.count({
        where: {
          requestId,
          OR: [
            { status: 'available' },
            { status: 'pending', createdAt: { gt: new Date(Date.now() - PENDING_HOLD_MS) } },
          ],
        },
      });
      if (held >= REQUEST_ATTACHMENT_MAX_FILES) {
        throw new ConflictException(`A request can carry at most ${REQUEST_ATTACHMENT_MAX_FILES} files`);
      }
      const id = randomUUID();
      const created = await tx.requestAttachment.create({
        data: {
          id,
          requestId,
          clientId: request.clientId,
          requesterEmployeeId: request.requesterEmployeeId,
          uploadedByUserId: actor,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          storageKey: this.storage.keyFor(request.clientId, 'requests', requestId, id),
        },
      });
      await this.audit.record(tx, {
        resource: 'request-attachment',
        resourceId: created.id,
        action: 'create',
        clientId: request.clientId,
        after: { requestId, contentType: created.contentType, sizeBytes: created.sizeBytes },
      });
      return created;
    });
    if (!row) return null;
    const url = await this.storage.presignUpload(row.storageKey, row.contentType, UPLOAD_TTL_SECONDS);
    return {
      attachment: (await this.present([row]))[0]!,
      upload: {
        url,
        method: 'PUT',
        headers: { 'Content-Type': row.contentType },
        expiresInSeconds: UPLOAD_TTL_SECONDS,
      },
    };
  }

  /**
   * Step 2: check what actually landed. Missing → 400. Otherwise the file ends
   * `available`, `quarantined` (infected) or `rejected` (over 10 MB, or not the
   * type it claimed); a refused blob is deleted. null → 404.
   */
  async confirm(path: AttachmentPath, requestId: string, fileId: string): Promise<RequestAttachment | null> {
    const actor = this.actor();
    const found = await this.run(path, async (tx) => {
      const request = await this.findRequest(tx, requestId);
      const file = request ? await this.findFile(tx, requestId, fileId) : null;
      return request && file ? { request, file } : null;
    });
    if (!found || !visibleTo(found.file, actor)) return null;
    const { request, file } = found;
    if (file.uploadedByUserId !== actor) throw new ForbiddenException('Only the person who uploaded a file confirms it');
    if (file.status !== 'pending') throw new ConflictException(`This file is already ${file.status}`);

    const stat = await this.storage.statObject(file.storageKey);
    if (!stat) throw new BadRequestException('The file has not arrived in storage');
    const verdict = await this.check(file, stat.size);
    if (verdict.status !== 'available') await this.storage.deleteObject(file.storageKey);

    const updated = await this.run(path, async (tx) => {
      const moved = await tx.requestAttachment.updateMany({
        where: { id: file.id, status: 'pending' },
        data: {
          status: verdict.status,
          ...(verdict.status === 'available' ? { sizeBytes: stat.size, confirmedAt: new Date() } : {}),
        },
      });
      if (moved.count !== 1) throw new ConflictException('This file was already confirmed');
      await this.audit.record(tx, {
        resource: 'request-attachment',
        resourceId: file.id,
        action: 'confirm',
        clientId: file.clientId,
        after: { requestId, status: verdict.status, sizeBytes: stat.size, ...(verdict.reason ? { reason: verdict.reason } : {}) },
      });
      // THREAD-03: a file from the requester's side that passed its checks
      // answers a request waiting on them. Re-read on this connection — the
      // status may have moved since the first read.
      if (verdict.status === 'available' && path.kind !== 'staff') {
        const current = await this.findRequest(tx, requestId);
        if (current) await returnIfWaiting(tx, this.audit, current);
      }
      return tx.requestAttachment.findUniqueOrThrow({ where: { id: file.id } });
    });
    if (updated.status === 'available') await this.publish(request, updated, path.kind === 'staff');
    return (await this.present([updated]))[0]!;
  }

  /** The uploader removes their own available file (soft). null → 404. */
  async remove(path: AttachmentPath, requestId: string, fileId: string): Promise<RequestAttachment | null> {
    const actor = this.actor();
    const updated = await this.run(path, async (tx) => {
      const file = await this.findFile(tx, requestId, fileId);
      if (!file || !visibleTo(file, actor)) return null;
      if (file.uploadedByUserId !== actor) throw new ForbiddenException('Only the person who uploaded a file removes it');
      const moved = await tx.requestAttachment.updateMany({
        where: { id: file.id, status: 'available' },
        data: { status: 'removed', removedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException(`This file is ${file.status}, not removable`);
      await this.audit.record(tx, {
        resource: 'request-attachment',
        resourceId: file.id,
        action: 'remove',
        clientId: file.clientId,
        after: { requestId },
      });
      return tx.requestAttachment.findUniqueOrThrow({ where: { id: file.id } });
    });
    if (!updated) return null;
    // The row is the record; the bytes go. A failure here leaves an orphan blob
    // no link can reach (removed files are never served) — logged, not fatal.
    await this.storage.deleteObject(updated.storageKey).catch((err: unknown) => {
      this.logger.warn(`Removed attachment ${updated.id}: blob not deleted (${String(err)})`);
    });
    return (await this.present([updated]))[0]!;
  }

  // ---- shared ---------------------------------------------------------------

  private async check(
    file: AttachmentRecord,
    size: number,
  ): Promise<{ status: 'available' | 'quarantined' | 'rejected'; reason?: string }> {
    if (size > REQUEST_ATTACHMENT_MAX_BYTES) return { status: 'rejected', reason: 'too-large' };
    const bytes = await this.storage.getObject(file.storageKey);
    // A virus is a virus whatever it claims to be — scan before the type check.
    const scan = await this.scanner.scan(bytes);
    if (!scan.clean) return { status: 'quarantined', reason: scan.signature ?? 'infected' };
    if (!matchesSignature(file.contentType, bytes)) return { status: 'rejected', reason: 'type-mismatch' };
    return { status: 'available' };
  }

  private run<T>(path: AttachmentPath, fn: (tx: Tx) => Promise<T>): Promise<T> {
    switch (path.kind) {
      case 'staff':
        return this.prisma.$transaction(fn);
      case 'client':
        return this.scoped.transaction(path.clientId, fn);
      case 'employee':
        return this.employeeDb.transaction(path.employeeId, fn);
    }
  }

  // The request as THIS path sees it — invisible is null.
  private findRequest(tx: Tx, requestId: string): Promise<RequestRecord | null> {
    return tx.request.findUnique({ where: { id: requestId } });
  }

  // A file of THIS request (a real id under another request is null too).
  private findFile(tx: Tx, requestId: string, fileId: string): Promise<AttachmentRecord | null> {
    return tx.requestAttachment.findFirst({ where: { id: fileId, requestId } });
  }

  private actor(): string {
    const actor = requestContext.get()?.actorId;
    if (!actor) throw new ForbiddenException('No signed-in user');
    return actor;
  }

  private async publish(request: RequestRecord, row: AttachmentRecord, byStaff: boolean): Promise<void> {
    await this.events.publish(
      new RequestAttachmentAddedEvent(
        request.id,
        request.clientId,
        request.title,
        row.uploadedByUserId,
        byStaff,
        request.createdByUserId,
        request.assigneeUserId,
        requestContext.get()?.requestId ?? null,
      ),
    );
  }

  private async present(rows: AttachmentRecord[]): Promise<RequestAttachment[]> {
    const who = await this.users.principals(rows.map((r) => r.uploadedByUserId));
    const me = requestContext.get()?.actorId ?? null;
    return rows.map((r) => {
      const removed = r.status === 'removed';
      return {
        id: r.id,
        status: r.status,
        // A removed file keeps its row ("removed by …") but not its name or size.
        fileName: removed ? null : r.fileName,
        contentType: removed ? null : r.contentType,
        sizeBytes: removed ? null : r.sizeBytes,
        uploadedBy: who.get(r.uploadedByUserId) ?? null,
        mine: r.uploadedByUserId === me,
        createdAt: r.createdAt.toISOString(),
        removedAt: r.removedAt?.toISOString() ?? null,
      };
    });
  }
}

// Available and removed files are the thread's; one still being checked, or
// one the check refused, belongs to its uploader alone.
function visibleTo(row: AttachmentRecord, actorId: string | null): boolean {
  return row.status === 'available' || row.status === 'removed' || row.uploadedByUserId === actorId;
}
