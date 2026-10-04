import type { LeaveResponse } from '@hr/contracts';
import type { LeaveRequestModel as LeaveRequestRecord } from '../../../generated/prisma/models';

const day = (d: Date): string => d.toISOString().slice(0, 10);
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// One response shape for every audience (staff, client manager, employee): the
// row carries nothing a reader of it may not see. `raisedByMe` is per caller —
// the screens offer Withdraw only on what the viewer raised (ADR-014).
export function toLeaveResponse(
  r: LeaveRequestRecord,
  ctx: {
    employee: { nameEn: string; nameAr: string } | undefined;
    raisedBy: LeaveResponse['raisedBy'];
    viewer: { userId: string | null; employeeId: string | null };
  },
): LeaveResponse {
  return {
    id: r.id,
    ref: r.ref,
    clientId: r.clientId,
    employee: { id: r.employeeId, nameEn: ctx.employee?.nameEn ?? '', nameAr: ctx.employee?.nameAr ?? '' },
    type: r.type,
    startDate: day(r.startDate),
    endDate: day(r.endDate),
    days: r.days,
    details: r.details,
    status: r.status,
    raisedBy: ctx.raisedBy,
    // An employee's own raise is matched on the employee (their user id and the
    // record are the same person); everyone else on the user who raised it.
    raisedByMe:
      r.raisedByEmployeeId !== null
        ? r.raisedByEmployeeId === ctx.viewer.employeeId
        : r.raisedByUserId === ctx.viewer.userId,
    decidedAt: iso(r.decidedAt),
    decidedOnBehalf: r.decidedOnBehalf,
    filedAt: iso(r.filedAt),
    withdrawnAt: iso(r.withdrawnAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
