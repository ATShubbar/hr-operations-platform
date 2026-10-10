import type { LeaveStatus, LeaveType } from '../../../generated/prisma/enums';

// The leave types and their statutory caps (ADR-014). References are the
// prototype's own citations — NOT a legal review; confirm before production.
// `cap` is the most days one request may take; `once` = once during service.
// Only annual leave reduces the balance (LEAVE-03); the rest are recorded.
export const LEAVE_TYPES: Readonly<
  Record<LeaveType, { cap: number | null; once: boolean; deducts: boolean; basis: string | null }>
> = {
  annual: { cap: null, once: false, deducts: true, basis: 'Art. 109' },
  sick: { cap: 120, once: false, deducts: false, basis: 'Art. 117' },
  maternity: { cap: 84, once: false, deducts: false, basis: 'Art. 151' },
  paternity: { cap: 3, once: false, deducts: false, basis: 'Art. 113' },
  marriage: { cap: 5, once: false, deducts: false, basis: 'Art. 113' },
  bereavement: { cap: 5, once: false, deducts: false, basis: 'Art. 113' },
  hajj: { cap: 15, once: true, deducts: false, basis: 'Art. 114' },
  emergency: { cap: null, once: false, deducts: false, basis: null },
  unpaid: { cap: null, once: false, deducts: false, basis: null },
};

// One request may span at most a year of calendar days (the column CHECK agrees).
export const MAX_REQUEST_DAYS = 365;

// Calendar days (ADR-014): the last day of leave is start + days − 1. Dates are
// date-only values at UTC midnight, so plain UTC arithmetic cannot drift.
export function leaveEndDate(start: Date, days: number): Date {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days - 1);
  return end;
}

// Why a request may not be raised, or null when it may. Every path (staff,
// client manager, employee) runs this before the insert.
export function raiseRefusal(input: {
  type: LeaveType;
  days: number;
  employeeStatus: string;
  // An earlier Hajj request that is pending, approved or filed.
  hajjOnRecord: boolean;
}): string | null {
  if (input.employeeStatus === 'terminated') {
    return 'Leave cannot be raised for an employee who has left';
  }
  // MOB-04a (ADR-018): mid-mobilisation — not yet arrived, so nothing to take.
  if (input.employeeStatus === 'onboarding') {
    return 'Leave cannot be raised for an employee who has not started yet';
  }
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_REQUEST_DAYS) {
    return `Days must be a whole number from 1 to ${MAX_REQUEST_DAYS}`;
  }
  const rule = LEAVE_TYPES[input.type];
  if (rule.cap !== null && input.days > rule.cap) {
    return `${input.type} leave is capped at ${rule.cap} days per request (${rule.basis})`;
  }
  if (rule.once && input.hajjOnRecord) {
    return `Hajj leave is granted once during service (${rule.basis})`;
  }
  return null;
}

// Statuses that keep a Hajj request "on record" for the once-only rule.
export const LIVE_STATUSES: readonly LeaveStatus[] = ['pending', 'approved', 'filed'];

// The workflow (ADR-014): pending → approved | declined | withdrawn;
// approved → filed. declined, withdrawn and filed are terminal.
const TRANSITIONS: Readonly<Record<LeaveStatus, readonly LeaveStatus[]>> = {
  pending: ['approved', 'declined', 'withdrawn'],
  approved: ['filed'],
  declined: [],
  withdrawn: [],
  filed: [],
};

export function canMove(from: LeaveStatus, to: LeaveStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
