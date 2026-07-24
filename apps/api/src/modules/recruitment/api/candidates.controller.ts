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
  changeCandidateStageRequestSchema,
  createCandidateRequestSchema,
  candidateQuerySchema,
  updateCandidateRequestSchema,
  type CandidateListResponse,
  type CandidateResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { CandidateModel as CandidateRecord } from '../../../generated/prisma/models';
import { CandidatesService } from '../application/candidates.service';
import type { UpdateCandidateInput } from '../domain/candidate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Candidates API (REC-04) — STAFF-INTERNAL only (candidates carry applicant PII/CVs
// that clients never see; there is no client-rep path). Recruiter has full CRUD +
// pipeline control; other staff read per the matrix (GRO/Finance excluded). The
// clientId is DERIVED from the vacancy by the service, never taken from input.
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @RequirePermission('candidate.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<CandidateResponse> {
    const parsed = createCandidateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid candidate payload');
    const req = parsed.data;
    const row = await this.candidates.create({
      vacancyId: req.vacancyId,
      nameAr: req.name.ar,
      nameEn: req.name.en,
      nationality: req.nationality ?? null,
      email: req.email ?? null,
      phone: req.phone ?? null,
      cvDocumentId: req.cvDocumentId ?? null,
      notes: req.notes ?? null,
      createdByUserId: requestContext.get()?.actorId ?? null,
    });
    return toResponse(row);
  }

  @RequirePermission('candidate.read')
  @Get()
  async list(@Query() query: unknown): Promise<CandidateListResponse> {
    const q = candidateQuerySchema.safeParse(query);
    const filters = q.success ? q.data : {};
    const rows = await this.candidates.list(filters);
    return { candidates: rows.map(toResponse) };
  }

  @RequirePermission('candidate.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<CandidateResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Candidate not found');
    const row = await this.candidates.getById(id);
    if (!row) throw new NotFoundException('Candidate not found');
    return toResponse(row);
  }

  @RequirePermission('candidate.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<CandidateResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Candidate not found');
    const parsed = updateCandidateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid candidate payload');
    const p = parsed.data;
    const data: UpdateCandidateInput = {
      ...(p.name ? { nameAr: p.name.ar, nameEn: p.name.en } : {}),
      ...(p.nationality !== undefined ? { nationality: p.nationality } : {}),
      ...(p.email !== undefined ? { email: p.email } : {}),
      ...(p.phone !== undefined ? { phone: p.phone } : {}),
      ...(p.cvDocumentId !== undefined ? { cvDocumentId: p.cvDocumentId } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
    };
    const row = await this.candidates.update(id, data);
    if (!row) throw new NotFoundException('Candidate not found');
    return toResponse(row);
  }

  // Advance the pipeline (REC-04). Validates the transition (illegal → 400).
  @RequirePermission('candidate.advance')
  @Post(':id/stage')
  @HttpCode(200)
  async changeStage(@Param('id') id: string, @Body() body: unknown): Promise<CandidateResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Candidate not found');
    const parsed = changeCandidateStageRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid stage payload');
    const row = await this.candidates.changeStage(id, parsed.data.stage);
    if (!row) throw new NotFoundException('Candidate not found');
    return toResponse(row);
  }

  @RequirePermission('candidate.delete')
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<CandidateResponse> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Candidate not found');
    const row = await this.candidates.remove(id);
    if (!row) throw new NotFoundException('Candidate not found');
    return toResponse(row);
  }
}

function toResponse(c: CandidateRecord): CandidateResponse {
  return {
    id: c.id,
    clientId: c.clientId,
    vacancyId: c.vacancyId,
    name: { ar: c.nameAr, en: c.nameEn },
    nationality: c.nationality,
    email: c.email,
    phone: c.phone,
    stage: c.stage,
    cvDocumentId: c.cvDocumentId,
    notes: c.notes,
    createdByUserId: c.createdByUserId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
