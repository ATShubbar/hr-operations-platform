import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createClientRequestSchema,
  updateClientRequestSchema,
  type ClientListResponse,
  type ClientResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import type { ClientModel as ClientRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../application/clients.service';
import type { ClientProfileInput } from '../domain/client';
import { toClientResponse } from '../domain/client-view';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff client-company management (CLIENT-02). Cross-client by design: staff
// manage every client. Per the matrix, `client.read` is held by all staff;
// create/update/delete by the Administrator only — enforced by the
// deny-by-default guard, so no role checks here. Client-rep "read own"
// (scoped) is a separate concern (CLIENT-03).
//
// PROF-01 (ADR-019): the same routes carry the client PROFILE — identity, the
// stored Nitaqat band, registrations, contact, signatories, portals and service
// facts. Who changes it is the matrix as it stands (`client.update`, the
// Administrator); every staff role reads it. A client manager reads their own
// company's through the portal, never here (they hold no `client.read`).
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @RequirePermission('client.read')
  @Get()
  async list(): Promise<ClientListResponse> {
    const rows = await this.clients.list();
    const officers = await this.clients.officersOf(rows);
    return { clients: rows.map((r) => toClientResponse(r, officers, 'staff')) };
  }

  @RequirePermission('client.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<ClientResponse> {
    return this.present(await this.require(id));
  }

  @RequirePermission('client.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<ClientResponse> {
    const parsed = createClientRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client payload');
    const { name, status, ...profile } = parsed.data;
    const row = await this.clients.create({
      nameAr: name.ar,
      nameEn: name.en,
      status,
      ...(profile satisfies ClientProfileInput),
    });
    return this.present(row);
  }

  @RequirePermission('client.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<ClientResponse> {
    this.assertUuid(id);
    const parsed = updateClientRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client payload');
    const { name, status, ...profile } = parsed.data;
    const row = await this.clients.update(id, {
      nameAr: name?.ar,
      nameEn: name?.en,
      status,
      ...(profile satisfies ClientProfileInput),
    });
    if (!row) throw new NotFoundException('Client not found');
    return this.present(row);
  }

  @RequirePermission('client.delete')
  @Delete(':id')
  async archive(@Param('id') id: string): Promise<ClientResponse> {
    this.assertUuid(id);
    const row = await this.clients.archive(id);
    if (!row) throw new NotFoundException('Client not found');
    return this.present(row);
  }

  private async present(row: ClientRecord): Promise<ClientResponse> {
    return toClientResponse(row, await this.clients.officersOf([row]), 'staff');
  }

  private async require(id: string): Promise<ClientRecord> {
    this.assertUuid(id);
    const row = await this.clients.getById(id);
    if (!row) throw new NotFoundException('Client not found');
    return row;
  }

  private assertUuid(id: string): void {
    if (!UUID_RE.test(id)) throw new NotFoundException('Client not found');
  }
}
