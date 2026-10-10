import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import type { ClientRole, Permission, StaffRole } from '../domain/permissions';
import { PolicyService } from './policy.service';
import type {
  CreateClientRepUserInput,
  CreateEmployeeUserInput,
  CreateStaffUserInput,
} from '../domain/user';

export type ClientRepStatus = 'active' | 'disabled';

// Identity access goes through the STAFF Prisma path only — auth_users is a
// system table with no app_client grants (see the auth_users migration).
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  /**
   * REQ-05 / ASSIGN-01 — who work can be handed to: an ACTIVE STAFF account whose
   * role holds `permission` (request.process, task.update, gro.process — read
   * from the catalog, never a second list). Not a client manager, an employee,
   * the Auditor, a disabled account or an unknown id. One rule for every kind of
   * work item, so they cannot drift.
   */
  async isActiveStaffWith(userId: string, permission: Permission): Promise<boolean> {
    const user = await this.prisma.authUser.findUnique({ where: { id: userId } });
    return (
      !!user &&
      user.principalType === 'staff' &&
      user.status === 'active' &&
      this.policy.can(user.role, permission)
    );
  }

  createStaffUser(input: CreateStaffUserInput): Promise<AuthUser> {
    return this.prisma.authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        passwordSetAt: new Date(),
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
        passwordSetAt: new Date(),
        principalType: 'client_rep',
        clientId: input.clientId,
        role: input.role,
      },
    });
  }

  // SS-01: the account an employee signs in with, bound to one employee record.
  // Invitation (who may call this, and from where) is SS-06; this only creates
  // the row, and the database refuses any inconsistent combination
  // (auth_users_principal_binding_chk / auth_users_employee_role_chk).
  createEmployeeUser(
    input: CreateEmployeeUserInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthUser> {
    return (tx ?? this.prisma).authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        passwordSetAt: new Date(),
        principalType: 'employee',
        role: 'employee',
        employeeId: input.employeeId,
      },
    });
  }

  // ---- Employee accounts (SS-06a) -----------------------------------------

  findByEmployeeId(employeeId: string, tx?: Prisma.TransactionClient): Promise<AuthUser | null> {
    return (tx ?? this.prisma).authUser.findUnique({ where: { employeeId } });
  }

  /**
   * An invited employee account: no password the holder knows yet. The stored
   * hash is of 32 random bytes nobody keeps, and status `invited` refuses
   * sign-in on its own — two independent reasons the account cannot be used
   * until its holder sets a password from the email link.
   */
  createInvitedEmployeeUser(
    input: { email: string; employeeId: string; unusablePasswordHash: string },
    tx?: Prisma.TransactionClient,
  ): Promise<AuthUser> {
    return (tx ?? this.prisma).authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.unusablePasswordHash,
        principalType: 'employee',
        role: 'employee',
        employeeId: input.employeeId,
        status: 'invited',
        passwordSetAt: null,
      },
    });
  }

  updateEmail(id: string, email: string, tx?: Prisma.TransactionClient): Promise<AuthUser> {
    return (tx ?? this.prisma).authUser.update({
      where: { id },
      data: { email: email.toLowerCase() },
    });
  }

  /**
   * Set a password chosen by the account's holder (invite or reset), and make an
   * invited account active. A DISABLED account stays disabled — a link cannot
   * reopen what staff closed.
   */
  setPassword(id: string, passwordHash: string, tx?: Prisma.TransactionClient): Promise<AuthUser> {
    return (tx ?? this.prisma).authUser.update({
      where: { id },
      data: { passwordHash, passwordSetAt: new Date() },
    });
  }

  setStatus(
    id: string,
    status: 'active' | 'disabled' | 'invited',
    tx?: Prisma.TransactionClient,
  ): Promise<AuthUser> {
    return (tx ?? this.prisma).authUser.update({ where: { id }, data: { status } });
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

  // Names for a set of actor ids (AUDIT-06's history): id → display name, for
  // any principal. Only the name — never the account's email or status.
  async displayNames(ids: readonly string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.authUser.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, displayName: true },
    });
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  // Who a set of accounts are, for display (DS-08: a request's requester): the
  // display name and the KIND of principal — never the email, status or role.
  async principals(
    ids: readonly string[],
  ): Promise<Map<string, { name: string | null; kind: 'staff' | 'client' | 'employee' }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.authUser.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, displayName: true, principalType: true },
    });
    // An explicit map, not an inline `=== 'client_rep' ? … :` (the SS-01 source
    // scan forbids that shape — it is how data paths failed open).
    const KIND = { staff: 'staff', client_rep: 'client', employee: 'employee' } as const;
    return new Map(rows.map((r) => [r.id, { name: r.displayName, kind: KIND[r.principalType] }]));
  }

  // Staff accounts by id, as a reader may see them (PROF-01: a client's named
  // officer): the display name and the role — the directory's two facts, never
  // the email or status. Non-staff ids are simply absent.
  async staffIdentities(
    ids: readonly string[],
  ): Promise<Map<string, { name: string | null; role: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.authUser.findMany({
      where: { id: { in: [...new Set(ids)] }, principalType: 'staff' },
      select: { id: true, displayName: true, role: true },
    });
    return new Map(rows.map((r) => [r.id, { name: r.displayName, role: r.role }]));
  }

  // How many ACTIVE accounts hold each role (DS-19, the Roles and permissions
  // screen). Invited and disabled accounts cannot sign in, so they do not count.
  async activeCountsByRole(): Promise<Map<string, number>> {
    const rows = await this.prisma.authUser.groupBy({
      by: ['role'],
      where: { status: 'active' },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.role, r._count._all]));
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
