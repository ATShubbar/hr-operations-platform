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
  createGcalInvitationRequestSchema,
  type GcalEventPayload,
  type GcalInvitationListResponse,
  type GcalInvitationResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { GcalInvitationModel as GcalInvitationRecord } from '../../../generated/prisma/models';
import { GcalInvitationsService } from '../application/gcal-invitations.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Google Calendar invitations API (GCAL-02, ADR-009) — STAFF-ONLY. The request is the
// WHITELISTED typed invitation; the service sends it via the adapter (the only path to
// Google) and persists the record + the exact payload that left. The response surfaces
// that payload so a caller can inspect precisely what was sent. Outbound only.
@Controller('integrations/google-calendar/invitations')
export class GcalInvitationsController {
  constructor(private readonly invitations: GcalInvitationsService) {}

  @RequirePermission('integration.google-calendar')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<GcalInvitationResponse> {
    const parsed = createGcalInvitationRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid invitation payload');
    const row = await this.invitations.create(parsed.data, requestContext.get()?.actorId ?? null);
    return toResponse(row);
  }

  @RequirePermission('integration.google-calendar')
  @Get()
  async list(): Promise<GcalInvitationListResponse> {
    const rows = await this.invitations.list();
    return { invitations: rows.map(toResponse) };
  }

  @RequirePermission('integration.google-calendar')
  @Get(':id')
  async get(@Param('id') id: string): Promise<GcalInvitationResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Invitation not found');
    const row = await this.invitations.getById(id);
    if (!row) throw new NotFoundException('Invitation not found');
    return toResponse(row);
  }

  @RequirePermission('integration.google-calendar')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<GcalInvitationResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Invitation not found');
    const parsed = createGcalInvitationRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid invitation payload');
    const row = await this.invitations.update(id, parsed.data);
    if (!row) throw new NotFoundException('Invitation not found');
    return toResponse(row);
  }

  @RequirePermission('integration.google-calendar')
  @Delete(':id')
  async cancel(@Param('id') id: string): Promise<GcalInvitationResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Invitation not found');
    const row = await this.invitations.cancel(id);
    if (!row) throw new NotFoundException('Invitation not found');
    return toResponse(row);
  }
}

function toResponse(r: GcalInvitationRecord): GcalInvitationResponse {
  return {
    id: r.id,
    externalEventId: r.externalEventId,
    referenceCode: r.referenceCode,
    kind: r.kind,
    status: r.status,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    timezone: r.timezone,
    payload: r.payload as unknown as GcalEventPayload,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
