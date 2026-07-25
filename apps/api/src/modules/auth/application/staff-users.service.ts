import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { PasswordService } from './password.service';
import { UsersService } from './users.service';
import type { StaffRole } from '../domain/permissions';

export type StaffUserStatus = 'active' | 'disabled';

interface CreateInput {
  email: string;
  password: string;
  role: StaffRole;
  displayName?: string;
}

interface UpdateInput {
  role?: StaffRole;
  status?: StaffUserStatus;
  displayName?: string;
}

// Staff user management (UX-10b). Consultancy staff accounts, per the matrix row
// "System config & staff users" — System Admin CRUD, Company Admin R.
//
// Lives in the auth module because auth OWNS auth_users (ADR-003 rule 3). The
// mirror image is ClientUsersService, which lives in `clients` and drives this
// module's UsersService through its public API; here the owning module is the
// caller, so the queries are local.
//
// NOT client-scoped: staff have no client_id, so unlike client-rep management
// there is no scope key to filter on. The gate is the permission alone, which is
// why the write permissions sit on system_admin only.
@Injectable()
export class StaffUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<AuthUser[]> {
    return this.prisma.authUser.findMany({
      where: { principalType: 'staff' },
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
    });
  }

  get(id: string): Promise<AuthUser | null> {
    return this.prisma.authUser.findFirst({ where: { id, principalType: 'staff' } });
  }

  async create(input: CreateInput): Promise<AuthUser> {
    if (await this.users.findByEmail(input.email)) {
      throw new BadRequestException('Email already in use');
    }
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.authUser.create({
          data: {
            email: input.email.toLowerCase(),
            passwordHash,
            principalType: 'staff',
            role: input.role,
            displayName: input.displayName ?? null,
          },
        });
        await this.audit.record(tx, {
          resource: 'staff-user',
          action: 'create',
          // Never the password or its hash — the ACT, not the secret.
          after: { email: user.email, role: user.role, displayName: user.displayName },
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

  /**
   * Update role, status or display name.
   *
   * `actorId` is the CALLER, and it is load-bearing: an administrator must not be
   * able to disable or demote their own account. There is exactly one
   * system_admin seat in a small consultancy, and locking it out of its own
   * console is unrecoverable without database access.
   */
  async update(actorId: string, id: string, data: UpdateInput): Promise<AuthUser | null> {
    if (id === actorId && (data.status === 'disabled' || data.role !== undefined)) {
      throw new BadRequestException('You cannot change your own role or disable your own account');
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.authUser.findFirst({ where: { id, principalType: 'staff' } });
      if (!before) return null;
      const row = await tx.authUser.update({
        where: { id },
        data: {
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        },
      });
      await this.audit.record(tx, {
        resource: 'staff-user',
        action: 'update',
        before: { role: before.role, status: before.status, displayName: before.displayName },
        after: { role: row.role, status: row.status, displayName: row.displayName },
      });
      return row;
    });
  }

  /**
   * Deactivate. Identity is never hard-deleted: sessions and audit entries
   * reference these ids, and an audit trail whose actor has vanished is not an
   * audit trail. Same reasoning as client-rep deactivation.
   */
  async deactivate(actorId: string, id: string): Promise<AuthUser | null> {
    if (id === actorId) {
      throw new BadRequestException('You cannot disable your own account');
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.authUser.findFirst({ where: { id, principalType: 'staff' } });
      if (!before) return null;
      if (before.status === 'disabled') return before; // no-op, no audit entry
      const row = await tx.authUser.update({ where: { id }, data: { status: 'disabled' } });
      await this.audit.record(tx, {
        resource: 'staff-user',
        action: 'deactivate',
        before: { status: before.status },
        after: { status: row.status },
      });
      return row;
    });
  }
}
