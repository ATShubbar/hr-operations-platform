import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DocumentModel as DocumentRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { StorageService } from '../../storage/public-api';
import type { CreateDocumentInput } from '../domain/document';

// Document registry access (DOC-01). Staff path only (app_staff). Metadata
// lives here; the blob lives in object storage under a per-client key the
// service derives (STOR-01). Every mutation writes its audit entry in the same
// transaction (AUDIT-03), scoped to the document's client; the snapshot is
// NON-SENSITIVE metadata (category/title/status/expiry) — never blob contents.
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  create(input: CreateDocumentInput): Promise<DocumentRecord> {
    // The service owns the object key: per-client prefix + a random object id,
    // so keys are unguessable and never collide (STOR-01 keyFor).
    const storageKey = this.storage.keyFor(
      input.clientId,
      'documents',
      randomUUID(),
      sanitizeFileName(input.fileName),
    );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.document.create({ data: { ...input, storageKey } });
      await this.audit.record(tx, {
        resource: 'document',
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(clientId?: string): Promise<DocumentRecord[]> {
    return this.prisma.document.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  listByClient(clientId: string): Promise<DocumentRecord[]> {
    return this.list(clientId);
  }

  getById(id: string): Promise<DocumentRecord | null> {
    return this.prisma.document.findUnique({ where: { id } });
  }

  // Expiry-scan support — the document-expiry engine (3.4) consumes this. Because
  // `expiryDate` is first-class (and indexed), "what expires on/before X" is a
  // cheap query, optionally narrowed to one client. Deleted documents excluded.
  expiringOnOrBefore(date: Date, clientId?: string): Promise<DocumentRecord[]> {
    return this.prisma.document.findMany({
      where: {
        expiryDate: { not: null, lte: date },
        status: { not: 'deleted' },
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { expiryDate: 'asc' },
    });
  }
}

// Keep only filename-safe characters in the object key; the real name is
// preserved in the `fileName` column for display/download.
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'file';
}

function snapshot(d: DocumentRecord): Prisma.InputJsonValue {
  return {
    category: d.category,
    title: d.title,
    status: d.status,
    expiryDate: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
  };
}
