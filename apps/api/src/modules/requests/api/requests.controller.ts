import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createRequestRequestSchema,
  requestQuerySchema,
  updateRequestRequestSchema,
  type RequestListResponse,
  type RequestResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { RequestModel as RequestRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { RequestsService } from '../application/requests.service';
import type { UpdateRequestInput } from '../domain/request';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Requests API (REQ-02) — the first DUAL-PATH resource. Consultancy staff manage
// requests across all clients; client reps create/read/update ONLY their own
// client's requests. The path is chosen by principal: a client_rep with a
// context clientId goes through the RLS-enforced scoped path (clientId ALWAYS
// from the session, never the body); staff go through the cross-client path.
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly clients: ClientsService,
  ) {}

  @RequirePermission('request.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<RequestResponse> {
    const parsed = createRequestRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request payload');
    const req = parsed.data;
    const ctx = requestContext.get();
    const actorId = ctx?.actorId;
    if (!actorId) throw new ForbiddenException('No authenticated actor');

    const base = {
      type: req.type,
      title: req.title,
      description: req.description ?? null,
      priority: req.priority,
      dueDate: req.dueDate ?? null,
      createdByUserId: actorId,
    };

    // Client rep: own client from the session; any body clientId is ignored.
    if (ctx.principalType === 'client_rep' && ctx.clientId) {
      const row = await this.requests.createForClient(ctx.clientId, {
        ...base,
        clientId: ctx.clientId,
      });
      return toResponse(row);
    }

    // Staff: clientId is required and validated (unknown → 404).
    if (!req.clientId) throw new BadRequestException('clientId is required');
    const client = await this.clients.getById(req.clientId);
    if (!client) throw new NotFoundException('Client not found');
    const row = await this.requests.create({ ...base, clientId: req.clientId });
    return toResponse(row);
  }

  @RequirePermission('request.read')
  @Get()
  async list(@Query() query: unknown): Promise<RequestListResponse> {
    const ctx = requestContext.get();
    if (ctx?.principalType === 'client_rep' && ctx.clientId) {
      const rows = await this.requests.listForClient(ctx.clientId);
      return { requests: rows.map(toResponse) };
    }
    const q = requestQuerySchema.safeParse(query);
    const clientId = q.success ? q.data.clientId : undefined;
    const rows = await this.requests.list(clientId);
    return { requests: rows.map(toResponse) };
  }

  @RequirePermission('request.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<RequestResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Request not found');
    const ctx = requestContext.get();
    const row =
      ctx?.principalType === 'client_rep' && ctx.clientId
        ? await this.requests.findForClient(ctx.clientId, id)
        : await this.requests.findById(id);
    if (!row) throw new NotFoundException('Request not found');
    return toResponse(row);
  }

  @RequirePermission('request.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<RequestResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Request not found');
    const parsed = updateRequestRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request payload');
    const data: UpdateRequestInput = parsed.data;
    const ctx = requestContext.get();

    const row =
      ctx?.principalType === 'client_rep' && ctx.clientId
        ? await this.requests.updateForClient(ctx.clientId, id, data)
        : await this.requests.update(id, data);
    if (!row) throw new NotFoundException('Request not found');
    return toResponse(row);
  }
}

function toResponse(r: RequestRecord): RequestResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
