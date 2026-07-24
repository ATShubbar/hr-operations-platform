import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { VacancyModel as VacancyRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateVacancyInput, UpdateVacancyInput } from '../domain/vacancy';

// Vacancy registry access (REC-01). Staff path only (app_staff, cross-client) via
// PrismaService — the client-rep read-own path (ScopedPrismaService) lands with
// REC-02's dual-path API. Every mutation writes its audit entry in the SAME
// transaction (AUDIT-03), scoped to the vacancy's client; the snapshot is
// non-sensitive metadata (title/status/department).
@Injectable()
export class VacanciesService {
  constructor(
    private readonly prisma: PrismaService,
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
