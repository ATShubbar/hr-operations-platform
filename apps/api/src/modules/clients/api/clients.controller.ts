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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff client-company management (CLIENT-02). Cross-client by design: staff
// manage every client. Per the matrix, `client.read` is held by all staff;
// create/update/delete by System/Company Admin only — enforced by the
// deny-by-default guard, so no role checks here. Client-rep "read own"
// (scoped) is a separate concern (CLIENT-03).
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @RequirePermission('client.read')
  @Get()
  async list(): Promise<ClientListResponse> {
    const rows = await this.clients.list();
    return { clients: rows.map(toResponse) };
  }

  @RequirePermission('client.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<ClientResponse> {
    return toResponse(await this.require(id));
  }

  @RequirePermission('client.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<ClientResponse> {
    const parsed = createClientRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client payload');
    const row = await this.clients.create({
      nameAr: parsed.data.name.ar,
      nameEn: parsed.data.name.en,
      status: parsed.data.status,
    });
    return toResponse(row);
  }

  @RequirePermission('client.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<ClientResponse> {
    this.assertUuid(id);
    const parsed = updateClientRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client payload');
    const row = await this.clients.update(id, {
      nameAr: parsed.data.name?.ar,
      nameEn: parsed.data.name?.en,
      status: parsed.data.status,
    });
    if (!row) throw new NotFoundException('Client not found');
    return toResponse(row);
  }

  @RequirePermission('client.delete')
  @Delete(':id')
  async archive(@Param('id') id: string): Promise<ClientResponse> {
    this.assertUuid(id);
    const row = await this.clients.archive(id);
    if (!row) throw new NotFoundException('Client not found');
    return toResponse(row);
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

function toResponse(row: ClientRecord): ClientResponse {
  return {
    id: row.id,
    name: { ar: row.nameAr, en: row.nameEn },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
