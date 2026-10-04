// Public surface of the leave module (ADR-003, ADR-014).
export { LeaveModule } from './leave.module';
export { LeaveService } from './application/leave.service';
export type { LeaveDecision, RaiseLeaveInput } from './application/leave.service';
export {
  LEAVE_TYPES,
  MAX_REQUEST_DAYS,
  canMove,
  leaveEndDate,
  raiseRefusal,
} from './domain/leave-rules';
