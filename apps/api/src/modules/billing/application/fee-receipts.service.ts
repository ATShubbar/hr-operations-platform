import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FEE_RECEIPT_MAX_BYTES } from '@hr/contracts';
import { randomUUID } from 'node:crypto';
import type { FeeModel as FeeRecord } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import {
  FILE_SCANNER,
  matchesSignature,
  StorageService,
  type FileScanner,
} from '../../storage/public-api';

// A fee's receipt (BILL-02, ADR-020): ONE file per fee, and the same three
// steps every upload here takes —
//   issue   → the file is declared and a presigned PUT is handed back (the
//             bytes go browser → object store, never through the API);
//   confirm → the server checks what actually arrived: over 10 MB or not the
//             type it claimed → `rejected`; infected → `quarantined`; either
//             way the blob is deleted. Otherwise `available`;
//   open    → a short-lived link, for an `available` receipt only.
// A void fee takes no new receipt, but the one it has stays readable: the
// record of what happened is not erased with the fee's standing.

const UPLOAD_TTL_SECONDS = 900;
const DOWNLOAD_TTL_SECONDS = 300;

@Injectable()
export class FeeReceiptsService {
  private readonly logger = new Logger(FeeReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
  ) {}

  async issue(
    feeId: string,
    file: { fileName: string; contentType: string; sizeBytes: number },
  ): Promise<{ fee: FeeRecord; url: string; contentType: string; expiresInSeconds: number }> {
    const fee = await this.prisma.$transaction(async (tx) => {
      const before = await tx.fee.findUnique({ where: { id: feeId } });
      if (!before) throw new NotFoundException('Fee not found');
      if (before.status === 'void') throw new ConflictException('A void fee takes no receipt');
      if (before.receiptStatus === 'available') {
        throw new ConflictException('This fee already has a receipt — remove it first');
      }
      // A fresh key every time: a refused or abandoned upload never collides
      // with the next attempt.
      const row = await tx.fee.update({
        where: { id: feeId },
        data: {
          receiptKey: this.storage.keyFor(before.clientId, 'fees', before.id, randomUUID()),
          receiptFileName: file.fileName,
          receiptContentType: file.contentType,
          receiptStatus: 'pending',
        },
      });
      await this.audit.record(tx, {
        resource: 'fee',
        action: 'receipt-upload',
        clientId: row.clientId,
        resourceId: row.id,
        after: { ref: row.ref, contentType: file.contentType, sizeBytes: file.sizeBytes },
      });
      return row;
    });
    const url = await this.storage.presignUpload(
      fee.receiptKey ?? '',
      file.contentType,
      UPLOAD_TTL_SECONDS,
    );
    return { fee, url, contentType: file.contentType, expiresInSeconds: UPLOAD_TTL_SECONDS };
  }

  async confirm(feeId: string): Promise<FeeRecord> {
    const fee = await this.prisma.fee.findUnique({ where: { id: feeId } });
    if (!fee) throw new NotFoundException('Fee not found');
    if (fee.receiptStatus !== 'pending' || !fee.receiptKey || !fee.receiptContentType) {
      throw new ConflictException('There is no receipt waiting to be confirmed');
    }
    const stat = await this.storage.statObject(fee.receiptKey);
    if (!stat) throw new BadRequestException('The file has not arrived in storage');
    const verdict = await this.check(fee.receiptKey, fee.receiptContentType, stat.size);
    if (verdict.status !== 'available') await this.storage.deleteObject(fee.receiptKey);

    return this.prisma.$transaction(async (tx) => {
      // Conditional on the key read above: a second confirm, or a new upload
      // issued meanwhile, does not get this verdict.
      const moved = await tx.fee.updateMany({
        where: { id: feeId, receiptStatus: 'pending', receiptKey: fee.receiptKey },
        data: { receiptStatus: verdict.status },
      });
      if (moved.count !== 1) throw new ConflictException('This receipt was already confirmed');
      await this.audit.record(tx, {
        resource: 'fee',
        action: 'receipt-confirm',
        clientId: fee.clientId,
        resourceId: fee.id,
        after: {
          ref: fee.ref,
          status: verdict.status,
          sizeBytes: stat.size,
          ...(verdict.reason ? { reason: verdict.reason } : {}),
        },
      });
      return tx.fee.findUniqueOrThrow({ where: { id: feeId } });
    });
  }

  /** A link to an AVAILABLE receipt; null when there is none to open. */
  async download(feeId: string): Promise<{ url: string; expiresInSeconds: number } | null> {
    const fee = await this.prisma.fee.findUnique({ where: { id: feeId } });
    if (!fee || fee.receiptStatus !== 'available' || !fee.receiptKey) return null;
    const url = await this.storage.presignDownload(
      fee.receiptKey,
      DOWNLOAD_TTL_SECONDS,
      fee.receiptFileName ?? undefined,
    );
    return { url, expiresInSeconds: DOWNLOAD_TTL_SECONDS };
  }

  async remove(feeId: string): Promise<FeeRecord> {
    const { row, key } = await this.prisma.$transaction(async (tx) => {
      const before = await tx.fee.findUnique({ where: { id: feeId } });
      if (!before) throw new NotFoundException('Fee not found');
      if (!before.receiptStatus) throw new ConflictException('This fee has no receipt');
      const updated = await tx.fee.update({
        where: { id: feeId },
        data: {
          receiptKey: null,
          receiptFileName: null,
          receiptContentType: null,
          receiptStatus: null,
        },
      });
      await this.audit.record(tx, {
        resource: 'fee',
        action: 'receipt-remove',
        clientId: before.clientId,
        resourceId: before.id,
        before: { ref: before.ref, fileName: before.receiptFileName, status: before.receiptStatus },
      });
      return { row: updated, key: before.receiptKey };
    });
    // The row no longer points at it; a failed delete leaves an orphan blob,
    // never a dangling receipt.
    if (key) {
      await this.storage.deleteObject(key).catch((err: unknown) => {
        this.logger.warn(`Could not delete receipt blob ${key}: ${String(err)}`);
      });
    }
    return row;
  }

  private async check(
    key: string,
    contentType: string,
    size: number,
  ): Promise<{ status: 'available' | 'quarantined' | 'rejected'; reason?: string }> {
    if (size > FEE_RECEIPT_MAX_BYTES) return { status: 'rejected', reason: 'too-large' };
    const bytes = await this.storage.getObject(key);
    // A virus is a virus whatever it claims to be — scan before the type check.
    const scan = await this.scanner.scan(bytes);
    if (!scan.clean) return { status: 'quarantined', reason: scan.signature ?? 'infected' };
    if (!matchesSignature(contentType, bytes))
      return { status: 'rejected', reason: 'type-mismatch' };
    return { status: 'available' };
  }
}
