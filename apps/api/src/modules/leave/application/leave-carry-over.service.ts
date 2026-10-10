import { hasJoined } from '@hr/contracts';
import { Injectable, Logger } from '@nestjs/common';
import type { CarryOverResponse } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import { EmployeesService } from '../../employees/public-api';
import { carryOverFrom } from '../domain/leave-balance';

// Carry-over (ADR-014, LEAVE-03): on 1 January each employee still employed is
// credited what the year before left unused — the 31 December balance, at most
// 10 days, never negative (carryOverFrom). Written as a `carried` ledger entry
// for the NEW year, one per person per year (a partial unique index), so the
// job is safe to run again: a re-run, a retry, or a manual run after the
// scheduled one credits nobody twice. Audited per credit (resource
// 'leave-balance'); the scheduled run has no actor (created_by_user_id NULL).
@Injectable()
export class LeaveCarryOverService {
  private readonly logger = new Logger(LeaveCarryOverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  async run(
    year: number,
    actorUserId: string | null,
    options: { clientId?: string } = {},
  ): Promise<CarryOverResponse> {
    const people = (await this.employees.list(options.clientId)).filter(
      // In post only (MOB-04a): neither a leaver nor someone still on the way in.
      (p) => hasJoined(p.employmentStatus),
    );
    const result: CarryOverResponse = { year, credited: 0, alreadyCredited: 0, nothingToCarry: 0 };

    for (const person of people) {
      const entries = await this.prisma.leaveEntry.findMany({
        where: { employeeId: person.id, leaveYear: { in: [year - 1, year] } },
      });
      if (entries.some((e) => e.kind === 'carried' && e.leaveYear === year)) {
        result.alreadyCredited += 1;
        continue;
      }
      const days = carryOverFrom({ hireDate: person.hireDate, year: year - 1, entries });
      if (days === 0) {
        result.nothingToCarry += 1;
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.leaveEntry.create({
          data: {
            clientId: person.clientId,
            employeeId: person.id,
            kind: 'carried',
            type: 'annual',
            days,
            leaveYear: year,
            createdByUserId: actorUserId,
          },
        });
        await this.audit.record(tx, {
          resource: 'leave-balance',
          resourceId: person.id,
          action: 'carry-over',
          clientId: person.clientId,
          ...(actorUserId ? {} : { actorId: null, actorRole: 'system' }),
          after: { year, days, from: year - 1 },
        });
      });
      result.credited += 1;
    }
    this.logger.log(
      `carry-over into ${year}: ${result.credited} credited, ${result.alreadyCredited} already, ${result.nothingToCarry} nothing to carry`,
    );
    return result;
  }
}
