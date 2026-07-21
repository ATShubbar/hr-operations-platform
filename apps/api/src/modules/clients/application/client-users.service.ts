import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import { Prisma } from '../../../generated/prisma/client';
import {
  PasswordService,
  UsersService,
  type ClientRepStatus,
  type ClientRole,
} from '../../auth/public-api';
import { AuditService } from '../../audit/public-api';

interface InviteInput {
  email: string;
  password: string;
  role: ClientRole;
}
interface UpdateInput {
  role?: ClientRole;
  status?: ClientRepStatus;
}

// Client portal user management (CLIENT-03). A Client Admin manages the
// client_rep users of ITS OWN client. Identity lives in auth_users (owned by
// the auth module), so this service drives auth's UsersService — it never
// touches auth_users directly. Every method is scoped to a clientId that the
// CALLER's context supplies; a client_id is never taken from request input.
// Mutations write their audit entry in the same transaction (AUDIT-03).
@Injectable()
export class ClientUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async invite(clientId: string, input: InviteInput): Promise<AuthUser> {
    if (await this.users.findByEmail(input.email)) {
      throw new BadRequestException('Email already in use');
    }
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.users.createClientRepUser(
          { email: input.email, passwordHash, clientId, role: input.role },
          tx,
        );
        await this.audit.record(tx, {
          resource: 'client-user',
          action: 'create',
          clientId,
          after: { email: user.email, role: user.role, status: user.status },
        });
        return user;
      });
    } catch (err) {
      // Unique-email race backstop (the pre-check handles the common case).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Email already in use');
      }
      throw err;
    }
  }

  list(clientId: string): Promise<AuthUser[]> {
    return this.users.listClientReps(clientId);
  }

  get(id: string, clientId: string): Promise<AuthUser | null> {
    return this.users.findClientRep(id, clientId);
  }

  update(clientId: string, id: string, data: UpdateInput): Promise<AuthUser | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.users.findClientRep(id, clientId, tx);
      if (!before) return null;
      const row = await this.users.updateClientRep(id, clientId, data, tx);
      await this.audit.record(tx, {
        resource: 'client-user',
        action: 'update',
        clientId,
        before: { role: before.role, status: before.status },
        after: { role: row?.role, status: row?.status },
      });
      return row;
    });
  }

  // Soft: identity is never hard-deleted (sessions, audit history reference it).
  deactivate(clientId: string, id: string): Promise<AuthUser | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.users.findClientRep(id, clientId, tx);
      if (!before) return null;
      if (before.status === 'disabled') return before; // no-op, no audit
      const row = await this.users.updateClientRep(id, clientId, { status: 'disabled' }, tx);
      await this.audit.record(tx, {
        resource: 'client-user',
        action: 'deactivate',
        clientId,
        before: { role: before.role, status: before.status },
        after: { role: row?.role, status: row?.status },
      });
      return row;
    });
  }
}
