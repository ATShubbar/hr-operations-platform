import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ClientModel as ClientRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateClientInput, UpdateClientInput } from '../domain/client';

// Client-company registry access (CLIENT-01/02). Staff path only: staff manage
// all clients (the permissive staff RLS policy shows every row; the policy
// service authorizes them). Every mutation writes its audit entry in the SAME
// transaction (AUDIT-03 pattern); the audit row is scoped to the affected
// client (its own id), so a client's trail includes changes to its record.
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(input: CreateClientInput): Promise<ClientRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.client.create({
        data: { nameAr: input.nameAr, nameEn: input.nameEn, status: input.status ?? 'active' },
      });
      await this.audit.record(tx, {
        resource: 'client',
        action: 'create',
        clientId: row.id,
        after: snapshot(row),
      });
      return row;
    });
  }

  list(): Promise<ClientRecord[]> {
    return this.prisma.client.findMany({ orderBy: { nameEn: 'asc' } });
  }

  getById(id: string): Promise<ClientRecord | null> {
    return this.prisma.client.findUnique({ where: { id } });
  }

  update(id: string, input: UpdateClientInput): Promise<ClientRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) return null;

      const data: Prisma.ClientUpdateInput = {};
      if (input.nameAr !== undefined) data.nameAr = input.nameAr;
      if (input.nameEn !== undefined) data.nameEn = input.nameEn;
      if (input.status !== undefined) data.status = input.status;

      const row = await tx.client.update({ where: { id }, data });
      await this.audit.record(tx, {
        resource: 'client',
        action: 'update',
        clientId: id,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  // Soft-archive (the matrix's "delete/archive"): a client company is the
  // isolation boundary that child data references, so it is never hard-deleted.
  archive(id: string): Promise<ClientRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) return null;
      if (before.status === 'inactive') return before; // already archived — no-op, no audit

      const row = await tx.client.update({ where: { id }, data: { status: 'inactive' } });
      await this.audit.record(tx, {
        resource: 'client',
        action: 'archive',
        clientId: id,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }
}

function snapshot(row: ClientRecord): Prisma.InputJsonValue {
  return { nameAr: row.nameAr, nameEn: row.nameEn, status: row.status };
}
