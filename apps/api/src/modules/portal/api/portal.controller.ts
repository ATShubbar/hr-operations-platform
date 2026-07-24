import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import type {
  ClientResponse,
  DocumentListResponse,
  DocumentResponse,
  DownloadResponse,
  EmployeeListResponse,
  EmployeeResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type {
  ClientModel as ClientRecord,
  DocumentModel as DocumentRecord,
} from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { DocumentsService, toDocumentResponse } from '../../documents/public-api';
import {
  EmployeesService,
  toEmployeeResponse,
  type EmployeeVisibility,
} from '../../employees/public-api';
import { StorageService } from '../../storage/public-api';

const CLIENT_SELF_SERVICE_FLAG = 'flag.client-self-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A portal download URL is short-lived (matches the staff download TTL, DOC-03).
const PORTAL_DOWNLOAD_TTL_SECONDS = 300;

// What a client rep may see of their own employees (PORTAL-02): core profile +
// government STATUS/EXPIRY, but never salary and never the raw government
// IDENTIFIER numbers (those stay in staff custody). This is the deferred EMP-02
// `status` tier, now live for the portal path.
const PORTAL_EMPLOYEE_VISIBILITY: EmployeeVisibility = { salary: false, govdata: 'status' };

// The Client Portal (PORTAL-01; architecture.md module 10) — a client-scoped
// DELIVERY surface with no business logic of its own: it reads from the domain
// modules' services and returns only the caller's OWN client's data. Every route
// is `portal.read` (client-only — staff never hold it, so /portal/* is exclusively
// the client self-service surface) and gated by the per-client
// `flag.client-self-service` feature flag (PORTAL-02/03 reuse assertPortalAccess).
@Controller('portal')
export class PortalController {
  constructor(
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
    private readonly employees: EmployeesService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
  ) {}

  // The caller's own company profile.
  @RequirePermission('portal.read')
  @Get('company')
  async company(): Promise<ClientResponse> {
    const clientId = this.scope();
    await this.assertPortalAccess(clientId);
    const row = await this.clients.getById(clientId);
    if (!row) throw new NotFoundException('Company not found');
    return toResponse(row);
  }

  // The caller's own employees, redacted to core + govdata:status (no salary,
  // no government identifiers).
  @RequirePermission('portal.read')
  @Get('employees')
  async employeesList(): Promise<EmployeeListResponse> {
    const clientId = this.scope();
    await this.assertPortalAccess(clientId);
    const rows = await this.employees.listByClient(clientId);
    return { employees: rows.map((r) => toEmployeeResponse(r, PORTAL_EMPLOYEE_VISIBILITY)) };
  }

  // One own employee — 404 (never 403) for another client's employee so the
  // portal never leaks the existence of out-of-scope records.
  @RequirePermission('portal.read')
  @Get('employees/:id')
  async employee(@Param('id') id: string): Promise<EmployeeResponse> {
    const clientId = this.scope();
    await this.assertPortalAccess(clientId);
    const row = UUID_RE.test(id) ? await this.employees.getById(id) : null;
    if (!row || row.clientId !== clientId) throw new NotFoundException('Employee not found');
    return toEmployeeResponse(row, PORTAL_EMPLOYEE_VISIBILITY);
  }

  // The caller's own AVAILABLE documents. Deliberately narrower than the staff
  // list: a client never sees pending uploads or quarantined (infected) blobs —
  // only clean, confirmed documents.
  @RequirePermission('portal.read')
  @Get('documents')
  async documentsList(): Promise<DocumentListResponse> {
    const clientId = this.scope();
    await this.assertPortalAccess(clientId);
    const rows = await this.documents.find({ clientId, status: 'available' });
    return { documents: rows.map(toDocumentResponse) };
  }

  // One own available document's metadata. Anything not own+available (another
  // client's, pending/quarantined/deleted, or unknown) is a uniform 404 — no
  // existence or state leak.
  @RequirePermission('portal.read')
  @Get('documents/:id')
  async document(@Param('id') id: string): Promise<DocumentResponse> {
    const doc = await this.ownAvailableDocument(id);
    return toDocumentResponse(doc);
  }

  // A short-lived presigned GET URL for an own available document. The storage
  // key is service-derived per-client, so the URL itself cannot cross clients.
  @RequirePermission('portal.read')
  @Get('documents/:id/download')
  async documentDownload(@Param('id') id: string): Promise<DownloadResponse> {
    const doc = await this.ownAvailableDocument(id);
    const url = await this.storage.presignDownload(doc.storageKey, PORTAL_DOWNLOAD_TTL_SECONDS);
    return { url, method: 'GET', expiresInSeconds: PORTAL_DOWNLOAD_TTL_SECONDS };
  }

  // Own + available or 404 — the single guard the document read/download share.
  private async ownAvailableDocument(id: string): Promise<DocumentRecord> {
    const clientId = this.scope();
    await this.assertPortalAccess(clientId);
    const doc = UUID_RE.test(id) ? await this.documents.getById(id) : null;
    if (!doc || doc.clientId !== clientId || doc.status !== 'available') {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  // The caller's client scope, always from the session — never input.
  private scope(): string {
    const clientId = requestContext.get()?.clientId;
    if (!clientId) throw new ForbiddenException('No client scope');
    return clientId;
  }

  // Portal reads are off unless self-service is enabled for this client.
  private async assertPortalAccess(clientId: string): Promise<void> {
    if (!(await this.config.isEnabled(CLIENT_SELF_SERVICE_FLAG, { clientId }))) {
      throw new ForbiddenException('Client self-service is not enabled');
    }
  }
}

function toResponse(row: ClientRecord): ClientResponse {
  return {
    id: row.id,
    name: { ar: row.nameAr, en: row.nameEn },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
