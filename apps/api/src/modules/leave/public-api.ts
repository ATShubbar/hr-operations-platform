// Public surface of the leave module (ADR-003, ADR-014).
export { LeaveModule } from './leave.module';
export { LeaveWorkerModule } from './leave-worker.module';
export { LeaveBalanceService } from './application/leave-balance.service';
export { LeaveCarryOverService } from './application/leave-carry-over.service';
export { LeaveService } from './application/leave.service';
export { LeavePresenter } from './application/leave-presenter';
export type { LeaveDecision, RaiseLeaveInput } from './application/leave.service';
export {
  LEAVE_TYPES,
  MAX_REQUEST_DAYS,
  canMove,
  leaveEndDate,
  raiseRefusal,
} from './domain/leave-rules';
export { LeaveStatusChangedEvent } from './domain/leave-status-changed.event';
export {
  CARRY_CAP,
  carryOverFrom,
  computeBalance,
  entitlementOn,
  monthsAccrued,
  riyadhToday,
  splitByYear,
} from './domain/leave-balance';
export type { Balance, LedgerRow } from './domain/leave-balance';
