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
  Query,
} from '@nestjs/common';
import {
  changeVacancyStatusRequestSchema,
  createVacancyRequestSchema,
  updateVacancyRequestSchema,
  vacancyQuerySchema,
  type VacancyListResponse,
  type VacancyPipeline,
  type VacancyResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import { scopeOf } from '../../../auth/scope';
import type { VacancyModel as VacancyRecord } from '../../../generated/prisma/models';
import { ClientsService } from '../../clients/public-api';
import { VacanciesService } from '../application/vacancies.service';
import type { UpdateVacancyInput } from '../domain/vacancy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vacancies API (REC-02) — a DUAL-PATH resource, but asymmetric: staff manage
// vacancies across all clients (create/update/status/delete); client reps only
// READ their own client's vacancies (matrix: "R own vacancies"). Reads pick the
// path by principal (a client_rep goes through the RLS-enforced scoped path, the
// clientId ALWAYS from the session); all writes are staff-only (client roles lack
// the vacancy.create/update/approve/delete permissions).
@Controller('vacancies')
export class VacanciesController {
  constructor(
    private readonly vacancies: VacanciesService,
    private readonly clients: ClientsService,
  ) {}

  @RequirePermission('vacancy.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<VacancyResponse> {
    const parsed = createVacancyRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid vacancy payload');
    const req = parsed.data;
    const actorId = requestContext.get()?.actorId;

    if (!(await this.clients.getById(req.clientId))) {
      throw new NotFoundException('Client not found');
    }
    const row = await this.vacancies.create({
      clientId: req.clientId,
      titleAr: req.title.ar,
      titleEn: req.title.en,
      description: req.description ?? null,
      department: req.department ?? null,
      headcount: req.headcount,
      openedByUserId: actorId ?? null,
    });
    return (await this.respond([row]))[0]!;
  }

  @RequirePermission('vacancy.read')
  @Get()
  async list(@Query() query: unknown): Promise<VacancyListResponse> {
    const scope = scopeOf(requestContext.get());
    if (scope.kind === 'client') {
      const rows = await this.vacancies.listForClient(scope.clientId);
      return { vacancies: await this.respond(rows) };
    }
    const q = vacancyQuerySchema.safeParse(query);
    const clientId = q.success ? q.data.clientId : undefined;
    const rows = await this.vacancies.list(clientId);
    return { vacancies: await this.respond(rows) };
  }

  @RequirePermission('vacancy.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<VacancyResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Vacancy not found');
    const scope = scopeOf(requestContext.get());
    const row =
      scope.kind === 'client'
        ? await this.vacancies.findForClient(scope.clientId, id)
        : await this.vacancies.getById(id);
    if (!row) throw new NotFoundException('Vacancy not found');
    return (await this.respond([row]))[0]!;
  }

  @RequirePermission('vacancy.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<VacancyResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Vacancy not found');
    const parsed = updateVacancyRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid vacancy payload');
    const p = parsed.data;
    const data: UpdateVacancyInput = {
      ...(p.title ? { titleAr: p.title.ar, titleEn: p.title.en } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.department !== undefined ? { department: p.department } : {}),
      ...(p.headcount !== undefined ? { headcount: p.headcount } : {}),
    };
    const row = await this.vacancies.update(id, data);
    if (!row) throw new NotFoundException('Vacancy not found');
    return (await this.respond([row]))[0]!;
  }

  // Advance the lifecycle (REC-02) — STAFF only (client reps lack vacancy.approve).
  // Validates the transition (illegal → 400).
  @RequirePermission('vacancy.approve')
  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(@Param('id') id: string, @Body() body: unknown): Promise<VacancyResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Vacancy not found');
    const parsed = changeVacancyStatusRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid status payload');
    const row = await this.vacancies.changeStatus(id, parsed.data.status);
    if (!row) throw new NotFoundException('Vacancy not found');
    return (await this.respond([row]))[0]!;
  }

  @RequirePermission('vacancy.delete')
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<VacancyResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Vacancy not found');
    const row = await this.vacancies.remove(id);
    if (!row) throw new NotFoundException('Vacancy not found');
    return (await this.respond([row]))[0]!;
  }

  // Every response carries its pipeline counts (DS-18). The ids are the rows this
  // request already read on its own path, so the counts follow the same scope.
  private async respond(rows: readonly VacancyRecord[]): Promise<VacancyResponse[]> {
    const pipelines = await this.vacancies.pipelines(rows.map((r) => r.id));
    return rows.map((r) => toResponse(r, pipelines.get(r.id)!));
  }
}

function toResponse(v: VacancyRecord, pipeline: VacancyPipeline): VacancyResponse {
  return {
    id: v.id,
    clientId: v.clientId,
    title: { ar: v.titleAr, en: v.titleEn },
    description: v.description,
    department: v.department,
    headcount: v.headcount,
    status: v.status,
    openedByUserId: v.openedByUserId,
    pipeline,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}
