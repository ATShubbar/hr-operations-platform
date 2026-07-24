import type { DocumentResponse } from '@hr/contracts';
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
