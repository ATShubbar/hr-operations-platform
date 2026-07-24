import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
} from '@nestjs/common';
import type { ClientResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { ClientModel as ClientRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';

const CLIENT_SELF_SERVICE_FLAG = 'flag.client-self-service';

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
