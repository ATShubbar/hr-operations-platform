import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ClientModel as ClientRecord } from '../../../generated/prisma/models';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import type {
  ClientOfficer,
  ClientProfileInput,
  CreateClientInput,
  UpdateClientInput,
} from '../domain/client';
import { clientSnapshot } from '../domain/client-view';

// Client-company registry access (CLIENT-01/02; the profile since PROF-01).
// Staff path only: staff manage all clients (the permissive staff RLS policy
// shows every row; the policy service authorizes them). Every mutation writes
// its audit entry in the SAME transaction (AUDIT-03 pattern); the audit row is
// scoped to the affected client (its own id), so a client's trail includes
// changes to its record.
//
// The profile (ADR-019) lives on the client's own row. Beyond the contract's
// shape checks, this service owns the rules that need the stored row or
// another module: the band's date is not in the future, the term cannot end
// before it starts (against the STORED other end on a partial change), the
// named officer is an active staff account that handles government work, and
// no two clients share a commercial registration.
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async create(input: CreateClientInput): Promise<ClientRecord> {
    const profile = profileData(input);
    await this.assertProfile(input, null);
    return this.guardRegistration(() =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.client.create({
          data: {
            nameAr: input.nameAr,
            nameEn: input.nameEn,
            status: input.status ?? 'active',
            ...profile,
          },
        });
        await this.audit.record(tx, {
          resource: 'client',
          action: 'create',
          clientId: row.id,
          after: clientSnapshot(row),
        });
        return row;
      }),
    );
  }

  list(): Promise<ClientRecord[]> {
    return this.prisma.client.findMany({ orderBy: { nameEn: 'asc' } });
  }

  getById(id: string): Promise<ClientRecord | null> {
    return this.prisma.client.findUnique({ where: { id } });
  }

  // The named officers of a set of clients, for display: a name and a role —
  // never an email or a status. An officer whose account no longer exists is
  // simply absent (the response then shows none).
  async officersOf(rows: readonly ClientRecord[]): Promise<Map<string, ClientOfficer>> {
    const ids = rows.flatMap((r) => (r.officerUserId ? [r.officerUserId] : []));
    return this.users.staffIdentities(ids);
  }

  async update(id: string, input: UpdateClientInput): Promise<ClientRecord | null> {
    const stored = await this.prisma.client.findUnique({ where: { id } });
    if (!stored) return null;
    await this.assertProfile(input, stored);
    return this.guardRegistration(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await tx.client.findUnique({ where: { id } });
        if (!before) return null;

        const data: Prisma.ClientUpdateInput = { ...profileData(input) };
        if (input.nameAr !== undefined) data.nameAr = input.nameAr;
        if (input.nameEn !== undefined) data.nameEn = input.nameEn;
        if (input.status !== undefined) data.status = input.status;

        const row = await tx.client.update({ where: { id }, data });
        await this.audit.record(tx, {
          resource: 'client',
          action: 'update',
          clientId: id,
          before: clientSnapshot(before),
          after: clientSnapshot(row),
        });
        return row;
      }),
    );
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
        before: clientSnapshot(before),
        after: clientSnapshot(row),
      });
      return row;
    });
  }

  // The rules the contract cannot see. `stored` is null on create.
  private async assertProfile(
    input: ClientProfileInput,
    stored: ClientRecord | null,
  ): Promise<void> {
    if (input.nitaqat) {
      // "Checked on" is a day someone looked at Qiwa — it cannot be ahead of us.
      // One day of slack: a date-only value has no zone, and Riyadh's today
      // begins three hours before UTC's.
      const limit = new Date();
      limit.setUTCHours(0, 0, 0, 0);
      limit.setUTCDate(limit.getUTCDate() + 1);
      if (input.nitaqat.checkedOn > limit) {
        throw new BadRequestException('The band cannot have been checked in the future');
      }
    }
    if (input.service) {
      const start =
        input.service.termStart !== undefined
          ? input.service.termStart
          : (stored?.termStart ?? null);
      const end =
        input.service.termEnd !== undefined ? input.service.termEnd : (stored?.termEnd ?? null);
      if (start && end && end < start) {
        throw new BadRequestException('The term cannot end before it starts');
      }
      const officer = input.service.officerUserId;
      // The ASSIGN-01 rule, for the same reason: the named officer is someone
      // government work can be handed to.
      if (officer && !(await this.users.isActiveStaffWith(officer, 'gro.process'))) {
        throw new BadRequestException(
          'The named officer must be an active staff account that handles government procedures',
        );
      }
    }
  }

  // The unique index is the guard (a check-then-write would race); its
  // violation is the caller's conflict, not a server error.
  private async guardRegistration<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Another client already has this commercial registration');
      }
      throw err;
    }
  }
}

// Input → columns. Only what the input NAMES is written (`undefined` = leave).
function profileData(input: ClientProfileInput): ProfileColumns {
  const data: ProfileColumns = {};
  if (input.crNumber !== undefined) data.crNumber = input.crNumber;
  if (input.city !== undefined) data.city = input.city;
  if (input.sector !== undefined) data.sector = input.sector;
  if (input.nitaqat !== undefined) {
    data.nitaqatBand = input.nitaqat?.band ?? null;
    data.nitaqatCheckedOn = input.nitaqat?.checkedOn ?? null;
  }
  const r = input.registrations;
  if (r?.qiwaEstablishment !== undefined) data.qiwaEstablishment = r.qiwaEstablishment;
  if (r?.gosiEstablishment !== undefined) data.gosiEstablishment = r.gosiEstablishment;
  if (r?.vatNumber !== undefined) data.vatNumber = r.vatNumber;
  const c = input.contact;
  if (c?.nameEn !== undefined) data.contactNameEn = c.nameEn;
  if (c?.nameAr !== undefined) data.contactNameAr = c.nameAr;
  if (c?.role !== undefined) data.contactRole = c.role;
  if (c?.email !== undefined) data.contactEmail = c.email;
  if (c?.phone !== undefined) data.contactPhone = c.phone;
  if (input.signatories !== undefined) data.signatories = input.signatories;
  if (input.portals !== undefined) data.portals = input.portals;
  const s = input.service;
  if (s?.officerUserId !== undefined) data.officerUserId = s.officerUserId;
  if (s?.tier !== undefined) data.serviceTier = s.tier;
  if (s?.responseCommitment !== undefined) data.responseCommitment = s.responseCommitment;
  if (s?.termStart !== undefined) data.termStart = s.termStart;
  if (s?.termEnd !== undefined) data.termEnd = s.termEnd;
  return data;
}

// Plain values only, so the same object serves a create and an update.
type ProfileColumns = Pick<
  Prisma.ClientUncheckedCreateInput,
  | 'crNumber'
  | 'city'
  | 'sector'
  | 'nitaqatBand'
  | 'nitaqatCheckedOn'
  | 'qiwaEstablishment'
  | 'gosiEstablishment'
  | 'vatNumber'
  | 'contactNameEn'
  | 'contactNameAr'
  | 'contactRole'
  | 'contactEmail'
  | 'contactPhone'
  | 'signatories'
  | 'portals'
  | 'officerUserId'
  | 'serviceTier'
  | 'responseCommitment'
  | 'termStart'
  | 'termEnd'
>;
