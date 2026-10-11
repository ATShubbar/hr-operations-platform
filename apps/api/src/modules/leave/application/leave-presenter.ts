import { Injectable } from '@nestjs/common';
import { dayIn } from '@hr/dates';
import type { LeaveResponse } from '@hr/contracts';
import { requestContext } from '../../../context/request-context';
import type { LeaveRequestModel as LeaveRequestRecord } from '../../../generated/prisma/models';
import { UsersService } from '../../auth/public-api';
import {
  ConfigService,
  DEFAULT_LEAVE_SERVICE_LEVEL_DAYS,
  LEAVE_SERVICE_LEVEL_KEY,
  leaveServiceLevelDaysSchema,
} from '../../configuration/public-api';
import { EmployeesService } from '../../employees/public-api';
import { leaveServiceLevel } from '../domain/leave-service-level';
import { toLeaveResponse } from '../domain/leave-view';

const FALLBACK_WEEK = [0, 1, 2, 3, 4];
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

// Names every row it is given — rows the caller was ALREADY allowed to read on
// its own path. Two lookups per response, however many rows (DS-08 pattern).
@Injectable()
export class LeavePresenter {
  constructor(
    private readonly users: UsersService,
    private readonly employees: EmployeesService,
    private readonly config: ConfigService,
  ) {}

  async many(rows: LeaveRequestRecord[]): Promise<LeaveResponse[]> {
    const [names, who, level] = await Promise.all([
      this.employees.namesOf(rows.map((r) => r.employeeId)),
      this.users.principals(rows.map((r) => r.raisedByUserId)),
      this.serviceLevelOf(rows),
    ]);
    const ctx = requestContext.get();
    const viewer = { userId: ctx?.actorId ?? null, employeeId: ctx?.employeeId ?? null };
    return rows.map((r) =>
      toLeaveResponse(r, {
        employee: names.get(r.employeeId),
        raisedBy: who.get(r.raisedByUserId) ?? null,
        viewer,
        serviceLevel: level(r),
      }),
    );
  }

  // SOON-03: the service level, worked out here from the CURRENT setting — one
  // read of the setting and the timezone, and one of each company's working week,
  // however many rows. Days are counted in the system's timezone.
  private async serviceLevelOf(
    rows: readonly LeaveRequestRecord[],
  ): Promise<(r: LeaveRequestRecord) => LeaveResponse['serviceLevel']> {
    const clientIds = [...new Set(rows.map((r) => r.clientId))];
    const [setting, zone, weeks] = await Promise.all([
      this.config.get(LEAVE_SERVICE_LEVEL_KEY),
      this.config.get('timezone'),
      Promise.all(
        clientIds.map(async (id) => {
          const week = (await this.config.getAllForClient(id))['working.week'];
          return [
            id,
            Array.isArray(week) && week.length > 0 ? (week as number[]) : FALLBACK_WEEK,
          ] as const;
        }),
      ),
    ]);
    const parsed = leaveServiceLevelDaysSchema.safeParse(setting);
    const days = parsed.success ? parsed.data : DEFAULT_LEAVE_SERVICE_LEVEL_DAYS;
    const tz = typeof zone === 'string' ? zone : 'Asia/Riyadh';
    const weekOf = new Map(weeks);
    const today = isoDay(dayIn(new Date(), tz));
    return (r) =>
      leaveServiceLevel({
        submittedOn: isoDay(dayIn(r.createdAt, tz)),
        status: r.status,
        filedOn: r.filedAt ? isoDay(dayIn(r.filedAt, tz)) : null,
        today,
        days,
        week: weekOf.get(r.clientId) ?? FALLBACK_WEEK,
      });
  }

  async one(row: LeaveRequestRecord): Promise<LeaveResponse> {
    return (await this.many([row]))[0]!;
  }
}
