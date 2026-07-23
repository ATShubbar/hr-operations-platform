import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import type { ClientRole, StaffRole } from '../domain/permissions';
import type { CreateClientRepUserInput, CreateStaffUserInput } from '../domain/user';

export type ClientRepStatus = 'active' | 'disabled';

// Identity access goes through the STAFF Prisma path only — auth_users is a
// system table with no app_client grants (see the auth_users migration).
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  createStaffUser(input: CreateStaffUserInput): Promise<AuthUser> {
    return this.prisma.authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        principalType: 'staff',
        role: input.role,
      },
    });
  }

  // Optional tx lets a caller (e.g. client-user management) compose this write
  // with an audit entry in one transaction. Same PrismaService singleton, so
  // the tx handle is interchangeable.
  createClientRepUser(
    input: CreateClientRepUserInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthUser> {
    return (tx ?? this.prisma).authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        principalType: 'client_rep',
        clientId: input.clientId,
        role: input.role,
      },
    });
  }

  // Client-rep management, ALWAYS scoped to a client (CLIENT-03). auth_users
  // has no RLS (system table), so isolation here is application-enforced: every
  // query is filtered by the caller's clientId, never a client_id from input.
  listClientReps(clientId: string, tx?: Prisma.TransactionClient): Promise<AuthUser[]> {
    return (tx ?? this.prisma).authUser.findMany({
      where: { principalType: 'client_rep', clientId },
      orderBy: { email: 'asc' },
    });
  }

  findClientRep(
    id: string,
    clientId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthUser | null> {
    return (tx ?? this.prisma).authUser.findFirst({
      where: { id, clientId, principalType: 'client_rep' },
    });
  }

  async updateClientRep(
    id: string,
    clientId: string,
    data: { role?: ClientRole; status?: ClientRepStatus },
    tx?: Prisma.TransactionClient,
  ): Promise<AuthUser | null> {
    const db = tx ?? this.prisma;
    // Scoped update: matches only a client_rep in THIS client. count 0 = not
    // found in scope (never reveals whether the id exists in another client).
    const res = await db.authUser.updateMany({
      where: { id, clientId, principalType: 'client_rep' },
      data,
    });
    if (res.count === 0) return null;
    return db.authUser.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.authUser.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<AuthUser | null> {
    return this.prisma.authUser.findUnique({ where: { id } });
  }

  // Active STAFF users holding any of the given roles (EXP-01). The document-
  // expiry engine fans an alert out to the consultancy staff who manage a
  // document's category (GRO → gov docs, HR/admin → all, …). Staff only —
  // client_reps are excluded — and disabled accounts are skipped.
  findStaffByRoles(roles: readonly StaffRole[]): Promise<AuthUser[]> {
    if (roles.length === 0) return Promise.resolve([]);
    return this.prisma.authUser.findMany({
      where: { principalType: 'staff', status: 'active', role: { in: [...roles] } },
      orderBy: { email: 'asc' },
    });
  }

  setMfaSecret(id: string, secret: string): Promise<AuthUser> {
    return this.prisma.authUser.update({ where: { id }, data: { mfaSecret: secret } });
  }
}
