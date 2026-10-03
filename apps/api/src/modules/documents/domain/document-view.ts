import type { DocumentResponse, SelfDocumentResponse } from '@hr/contracts';
import type { DocumentModel as DocumentRecord } from '../../../generated/prisma/models';

// The document read view (DOC-03). Extracted from the staff controller so the
// client portal (PORTAL-03) maps records through the SAME shape. Document
// metadata carries no field-level redaction — it is fully visible to the owning
// client — so this is a straight record→response mapping.
function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export function toDocumentResponse(d: DocumentRecord): DocumentResponse {
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

// An employee's OWN document (SS-04) — a whitelist, built field by field, not the
// staff response trimmed: storage key, legal hold, uploader, size, status, client
// and employee ids and timestamps stay with the registry.
export function toSelfDocumentResponse(d: DocumentRecord): SelfDocumentResponse {
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    fileName: d.fileName,
    contentType: d.contentType,
    issueDate: iso(d.issueDate),
    expiryDate: iso(d.expiryDate),
  };
}

