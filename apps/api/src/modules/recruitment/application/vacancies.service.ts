import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import type { VacancyModel as VacancyRecord } from '../../../generated/prisma/models';
import type { Prisma, VacancyStatus } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateVacancyInput, UpdateVacancyInput } from '../domain/vacancy';
import { canTransition } from '../domain/vacancy-status-workflow';

// Vacancy registry access (REC-01/02). TWO data paths, both owned here:
//   - STAFF path (app_staff, cross-client) via PrismaService — create/update/
//     changeStatus/remove + list/getById.
//   - CLIENT-REP path (app_client, own-client, RLS-enforced) via ScopedPrismaService
//     — READ ONLY (*ForClient); clients never write vacancies (the SELECT-only
//     grant + no write endpoints enforce this).
// Every mutation writes its audit entry in the SAME transaction (AUDIT-03),
// scoped to the vacancy's client; the snapshot is non-sensitive metadata.
@Injectable()
export class VacanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateVacancyInput): Promise<VacancyRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'vacancy',
        action: 'create',
        clientId: row.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(clientId?: string): Promise<VacancyRecord[]> {
    return this.prisma.vacancy.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  listByClient(clientId: string): Promise<VacancyRecord[]> {
    return this.list(clientId);
  }

  getById(id: string): Promise<VacancyRecord | null> {
    return this.prisma.vacancy.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateVacancyInput): Promise<VacancyRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.vacancy.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.vacancy.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'vacancy',
        action: 'update',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  // Advance a vacancy's status (REC-02), staff path. Validates the transition
  // (illegal → 400), audits before/after — all in one tx. Returns null if the
  // vacancy is missing.
  async changeStatus(id: string, to: VacancyStatus): Promise<VacancyRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.vacancy.findUnique({ where: { id } });
      if (!before) return null;
      if (!canTransition(before.status, to)) {
        throw new BadRequestException(`Cannot move a vacancy from '${before.status}' to '${to}'`);
      }
      const row = await tx.vacancy.update({ where: { id }, data: { status: to } });
      await this.audit.record(tx, {
        resource: 'vacancy',
        action: 'status',
        clientId: row.clientId,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  async remove(id: string): Promise<VacancyRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.vacancy.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.vacancy.delete({ where: { id } });
      await this.audit.record(tx, {
        resource: 'vacancy',
        action: 'delete',
        clientId: before.clientId,
        before: snapshot(before),
      });
      return row;
    });
  }

  // ---- client-representative path (own-client, RLS-enforced, READ ONLY) ----

  listForClient(clientId: string): Promise<VacancyRecord[]> {
    return this.scoped.forClient(clientId).vacancy.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // RLS filters the row to the caller's client, so a foreign id resolves to null.
  findForClient(clientId: string, id: string): Promise<VacancyRecord | null> {
    return this.scoped.forClient(clientId).vacancy.findUnique({ where: { id } });
  }
}

function toCreateData(input: CreateVacancyInput): Prisma.VacancyUncheckedCreateInput {
  return {
    clientId: input.clientId,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    description: input.description ?? null,
    department: input.department ?? null,
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    openedByUserId: input.openedByUserId ?? null,
  };
}

function toUpdateData(data: UpdateVacancyInput): Prisma.VacancyUpdateInput {
  return {
    ...(data.titleAr !== undefined ? { titleAr: data.titleAr } : {}),
    ...(data.titleEn !== undefined ? { titleEn: data.titleEn } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.department !== undefined ? { department: data.department } : {}),
    ...(data.headcount !== undefined ? { headcount: data.headcount } : {}),
  };
}

function snapshot(v: VacancyRecord): Prisma.InputJsonValue {
  return {
    titleEn: v.titleEn,
    status: v.status,
    department: v.department ?? null,
    headcount: v.headcount,
  };
}
