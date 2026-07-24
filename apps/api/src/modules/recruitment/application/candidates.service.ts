import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CandidateModel as CandidateRecord } from '../../../generated/prisma/models';
import type { CandidateStage, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateCandidateInput, UpdateCandidateInput } from '../domain/candidate';
import { canTransition } from '../domain/candidate-stage-workflow';
import { VacanciesService } from './vacancies.service';

// Candidate registry access (REC-03). STAFF-INTERNAL — no client-rep path (clients
// never see candidates). Every mutation writes its audit entry in the SAME
// transaction (AUDIT-03), scoped to the candidate's client (derived from the
// vacancy); the snapshot is non-sensitive metadata (name/stage), never the CV.
@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vacancies: VacanciesService,
    private readonly audit: AuditService,
  ) {}

  // The vacancy is validated and its clientId is DERIVED here — a candidate can
  // never be attributed to a client the vacancy doesn't belong to.
  async create(input: CreateCandidateInput): Promise<CandidateRecord> {
    const vacancy = await this.vacancies.getById(input.vacancyId);
    if (!vacancy) throw new BadRequestException('Unknown vacancy');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.candidate.create({
        data: toCreateData(input, vacancy.clientId),
      });
      await this.audit.record(tx, {
        resource: 'candidate',
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(filters?: { vacancyId?: string; stage?: CandidateStage }): Promise<CandidateRecord[]> {
    return this.prisma.candidate.findMany({
      where: {
        ...(filters?.vacancyId ? { vacancyId: filters.vacancyId } : {}),
        ...(filters?.stage ? { stage: filters.stage } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getById(id: string): Promise<CandidateRecord | null> {
    return this.prisma.candidate.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateCandidateInput): Promise<CandidateRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.candidate.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.candidate.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'candidate',
        action: 'update',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  // Advance the pipeline stage (REC-04). Validates the transition (illegal → 400),
  // audits before/after — all in one tx. Returns null if the candidate is missing.
  // (REC-05 will publish CandidateHired here when the target stage is `hired`.)
  async changeStage(id: string, to: CandidateStage): Promise<CandidateRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.candidate.findUnique({ where: { id } });
      if (!before) return null;
      if (!canTransition(before.stage, to)) {
        throw new BadRequestException(`Cannot move a candidate from '${before.stage}' to '${to}'`);
      }
      const row = await tx.candidate.update({ where: { id }, data: { stage: to } });
      await this.audit.record(tx, {
        resource: 'candidate',
        action: 'stage',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  async remove(id: string): Promise<CandidateRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.candidate.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.candidate.delete({ where: { id } });
      await this.audit.record(tx, {
        resource: 'candidate',
        action: 'delete',
        clientId: before.clientId,
        before: snapshot(before),
      });
      return row;
    });
  }
}

function toCreateData(
  input: CreateCandidateInput,
  clientId: string,
): Prisma.CandidateUncheckedCreateInput {
  return {
    clientId,
    vacancyId: input.vacancyId,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    email: input.email ?? null,
    phone: input.phone ?? null,
    cvDocumentId: input.cvDocumentId ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId ?? null,
  };
}

function toUpdateData(data: UpdateCandidateInput): Prisma.CandidateUpdateInput {
  return {
    ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
    ...(data.nameEn !== undefined ? { nameEn: data.nameEn } : {}),
    ...(data.email !== undefined ? { email: data.email } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.cvDocumentId !== undefined ? { cvDocumentId: data.cvDocumentId } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
  };
}

function snapshot(c: CandidateRecord): Prisma.InputJsonValue {
  return {
    nameEn: c.nameEn,
    stage: c.stage,
    vacancyId: c.vacancyId,
  };
}
