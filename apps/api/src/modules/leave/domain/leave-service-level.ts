import { addWorkingDays, workingDaysBetween } from '@hr/dates';
import type { LeaveServiceLevel, LeaveStatus } from '@hr/contracts';

// The service level of a leave request (SOON-03).
//
// Owner decision: "a setting, shown and measured". The clock runs from the day
// the request was SUBMITTED until PEOPLE&GRO FILES it, in working days of the
// company's own week. Approval by the employer does not stop it: an approved
// request that is not yet filed is still owed.
//
// Nothing is stored. The due date and the state are worked out when a request is
// read, from the current setting — so changing the setting re-measures every
// request, open and past. (Requests differ on purpose: they store a due date,
// because it can be moved by hand and is paused while detail is awaited. A leave
// request has neither.)
//
//   running  — not filed, and today is on or before the due date
//   overdue  — not filed, and the due date has passed
//   met      — filed on or before the due date
//   late     — filed after it
//   closed   — declined or withdrawn: nothing was owed
//
// Pure: every date is a YYYY-MM-DD day, already in the system's timezone.

const at = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function leaveServiceLevel(input: {
  submittedOn: string;
  status: LeaveStatus;
  filedOn: string | null;
  today: string;
  days: number;
  week: readonly number[];
}): LeaveServiceLevel {
  const due = addWorkingDays(at(input.submittedOn), input.days, input.week);
  const dueOn = iso(due);
  const level = (state: LeaveServiceLevel['state'], until?: string): LeaveServiceLevel => ({
    days: input.days,
    dueOn,
    state,
    workingDaysOver: until ? workingDaysBetween(due, at(until), input.week) : 0,
  });

  if (input.status === 'declined' || input.status === 'withdrawn') return level('closed');
  if (input.status === 'filed') {
    // A filed request with no filing day cannot be judged late: treat it as met.
    const filedOn = input.filedOn ?? dueOn;
    return filedOn <= dueOn ? level('met') : level('late', filedOn);
  }
  return input.today <= dueOn ? level('running') : level('overdue', input.today);
}
