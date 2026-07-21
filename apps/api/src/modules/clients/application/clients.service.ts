import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ClientModel as ClientRecord } from '../../../generated/prisma/models';
import type { CreateClientInput } from '../domain/client';

// Client-company registry access (CLIENT-01). Staff path only: staff manage
// all clients (the application policy service authorizes them; the permissive
// staff RLS policy lets them see every row). The client-rep read of its own
// company (matrix "R own") arrives with the HTTP API in CLIENT-02, through
// ScopedPrismaService so RLS keys the row's own id to the caller's scope.
@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateClientInput): Promise<ClientRecord> {
    return this.prisma.client.create({
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        status: input.status ?? 'active',
      },
    });
  }

  list(): Promise<ClientRecord[]> {
    return this.prisma.client.findMany({ orderBy: { nameEn: 'asc' } });
  }

  getById(id: string): Promise<ClientRecord | null> {
    return this.prisma.client.findUnique({ where: { id } });
  }
}
