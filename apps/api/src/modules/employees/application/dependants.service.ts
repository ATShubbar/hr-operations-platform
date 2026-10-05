import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DependantModel as DependantRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { requestContext } from '../../../context/request-context';
import { AuditService } from '../../audit/public-api';
import type { DependantInput, DependantPatch } from '../domain/dependant';

// Dependants (DEP-01, ADR-017): the family on an employee's sponsorship. Staff
// path for add/edit/remove (DEP-02 gates it on govdata.update); the employee's
// own read goes through the app_employee connection, so the DATABASE decides
// whose rows exist.
//
// Every change is audited as resource `dependant` against the SPONSOR
// (`resource_id` = the employee — the Person record's History reads by it,
// AUDIT-06), with the employee's company. Like EmployeesService, the snapshot
// is deliberately non-sensitive: who, which relationship, and WHICH fields
// changed — never the iqama number or the dates themselves.
@Injectable()
export class DependantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employeeDb: EmployeeScopedPrismaService,
  ) {}

  async listFor(employeeId: string): Promise<DependantRecord[]> {
    return order(await this.prisma.dependant.findMany({ where: { employeeId, removedAt: null } }));
  }

  // The employee's OWN dependants. The id MUST come from the session: the
  // unfiltered query below returns whatever the employee_self policy admits.
  async listForSelf(employeeId: string): Promise<DependantRecord[]> {
    return order(
      await this.employeeDb
        .forEmployee(employeeId)
        .dependant.findMany({ where: { removedAt: null } }),
    );
  }

  async add(employeeId: string, input: DependantInput): Promise<DependantRecord> {
    const nameEn = input.nameEn.trim();
    if (!nameEn) throw new BadRequestException('A dependant needs a name');
    return this.prisma.$transaction(async (tx) => {
      const sponsor = await tx.employee.findUnique({
        where: { id: employeeId },
        select: { clientId: true },
      });
      if (!sponsor) throw new NotFoundException('Employee not found');
      const row = await tx.dependant.create({
        data: { ...clean(input), relationship: input.relationship, nameEn, employeeId },
      });
      await this.audit.record(tx, {
        resource: 'dependant',
        resourceId: employeeId,
        action: 'create',
        clientId: sponsor.clientId,
        after: snapshot(row),
      });
      return row;
    });
  }

  async update(
    employeeId: string,
    dependantId: string,
    patch: DependantPatch,
  ): Promise<DependantRecord> {
    if (patch.nameEn !== undefined && !patch.nameEn.trim())
      throw new BadRequestException('A dependant needs a name');
    return this.prisma.$transaction(async (tx) => {
      const { before, clientId } = await this.current(tx, employeeId, dependantId);
      const data = clean(patch);
      if (data.nameEn !== undefined) data.nameEn = data.nameEn.trim();
      const row = await tx.dependant.update({ where: { id: dependantId }, data });
      await this.audit.record(tx, {
        resource: 'dependant',
        resourceId: employeeId,
        action: 'update',
        clientId,
        before: snapshot(before),
        after: { ...snapshot(row), changed: changedFields(before, row) },
      });
      return row;
    });
  }

  remove(employeeId: string, dependantId: string): Promise<DependantRecord> {
    return this.prisma.$transaction(async (tx) => {
      const { before, clientId } = await this.current(tx, employeeId, dependantId);
      const actorId = requestContext.get()?.actorId;
      if (!actorId) throw new BadRequestException('Removing a dependant needs a signed-in actor');
      const row = await tx.dependant.update({
        where: { id: dependantId },
        data: { removedAt: new Date(), removedByUserId: actorId },
      });
      await this.audit.record(tx, {
        resource: 'dependant',
        resourceId: employeeId,
        action: 'remove',
        clientId,
        before: snapshot(before),
      });
      return row;
    });
  }

  /** The live dependant of THIS sponsor — another sponsor's id is "not found", a removed one is final. */
  private async current(tx: Prisma.TransactionClient, employeeId: string, dependantId: string) {
    const before = await tx.dependant.findUnique({ where: { id: dependantId } });
    if (!before || before.employeeId !== employeeId)
      throw new NotFoundException('Dependant not found');
    if (before.removedAt) throw new ConflictException('This dependant has been removed');
    const sponsor = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { clientId: true },
    });
    if (!sponsor) throw new NotFoundException('Employee not found');
    return { before, clientId: sponsor.clientId };
  }
}

const RANK = { spouse: 0, son: 1, daughter: 1 } as const;

/** Spouse first, then children oldest first (no birth date last), then by when they were added. */
function order(rows: DependantRecord[]): DependantRecord[] {
  const born = (d: DependantRecord) => d.dateOfBirth?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...rows].sort(
    (a, b) =>
      RANK[a.relationship] - RANK[b.relationship] ||
      born(a) - born(b) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

const FIELDS = [
  'relationship',
  'nameEn',
  'nameAr',
  'dateOfBirth',
  'iqamaNumber',
  'iqamaExpiry',
  'passportExpiry',
  'insuranceExpiry',
] as const;

/** Only the dependant's own fields — never an id, sponsor or removal stamp from input. */
function clean(input: DependantPatch): DependantPatch {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) if (input[k] !== undefined) out[k] = input[k];
  return out as DependantPatch;
}

function changedFields(before: DependantRecord, after: DependantRecord): string[] {
  const v = (x: unknown) => (x instanceof Date ? x.getTime() : x);
  return FIELDS.filter((k) => v(before[k]) !== v(after[k]));
}

function snapshot(d: DependantRecord): {
  dependantId: string;
  relationship: string;
  nameEn: string;
} {
  return { dependantId: d.id, relationship: d.relationship, nameEn: d.nameEn };
}
