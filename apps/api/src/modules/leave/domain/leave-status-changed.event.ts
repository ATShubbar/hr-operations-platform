import type { LeaveStatus, LeaveType } from '../../../generated/prisma/enums';
import type { DomainEvent } from '../../events/public-api';

// A leave request was approved, declined or filed (ADR-014, LEAVE-02). Owned by
// Leave; Notifications subscribes and tells whoever raised it (ADR-004 — Leave
// never calls notify()). Carries the recipient so the consumer stays ignorant of
// who raised what. Published once per decision, after the commit.
export class LeaveStatusChangedEvent implements DomainEvent {
  static readonly NAME = 'leave.status-changed';
  readonly name = LeaveStatusChangedEvent.NAME;

  constructor(
    readonly requestId: string,
    readonly ref: string,
    readonly clientId: string,
    readonly type: LeaveType,
    readonly startDate: string, // YYYY-MM-DD
    readonly days: number,
    readonly status: LeaveStatus,
    readonly recipientUserId: string, // whoever raised the request
    readonly correlationId: string | null,
  ) {}
}
