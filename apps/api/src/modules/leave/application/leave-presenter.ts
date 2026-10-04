import { Injectable } from '@nestjs/common';
import type { LeaveResponse } from '@hr/contracts';
import { requestContext } from '../../../context/request-context';
import type { LeaveRequestModel as LeaveRequestRecord } from '../../../generated/prisma/models';
import { UsersService } from '../../auth/public-api';
import { EmployeesService } from '../../employees/public-api';
import { toLeaveResponse } from '../domain/leave-view';

// Names every row it is given — rows the caller was ALREADY allowed to read on
// its own path. Two lookups per response, however many rows (DS-08 pattern).
@Injectable()
export class LeavePresenter {
  constructor(
    private readonly users: UsersService,
    private readonly employees: EmployeesService,
  ) {}

  async many(rows: LeaveRequestRecord[]): Promise<LeaveResponse[]> {
    const [names, who] = await Promise.all([
      this.employees.namesOf(rows.map((r) => r.employeeId)),
      this.users.principals(rows.map((r) => r.raisedByUserId)),
    ]);
    const ctx = requestContext.get();
    const viewer = { userId: ctx?.actorId ?? null, employeeId: ctx?.employeeId ?? null };
    return rows.map((r) =>
      toLeaveResponse(r, {
        employee: names.get(r.employeeId),
        raisedBy: who.get(r.raisedByUserId) ?? null,
        viewer,
      }),
    );
  }

  async one(row: LeaveRequestRecord): Promise<LeaveResponse> {
    return (await this.many([row]))[0]!;
  }
}
