import { isFinished, type CalendarItem, type CalendarItemKind, type WorkKind } from '@hr/contracts';
import type { CalendarEventModel as CalendarEventRecord } from '../../../generated/prisma/models';

// Calendar-view aggregation helpers (CAL-02). The view merges own calendar events
// with read-only ACTIVE deadlines from Tasks/Requests/GRO — finished items are
// excluded so the calendar shows only work that still has a live deadline.
// "Finished" is the ONE shared definition (CAL-04, @hr/contracts/work-status) —
// the queue and overviews use the same, so the screens can't disagree.

/** The kinds that are deadlines of a work item with a status of its own. */
type DeadlineKind = Exclude<CalendarItemKind, 'event' | 'step'>;

const KIND: Record<DeadlineKind, WorkKind> = {
  task: 'task',
  request: 'request',
  gro: 'procedure',
};

export function isActiveDeadline(kind: DeadlineKind, status: string): boolean {
  return !isFinished(KIND[kind], status);
}

// Whether a (nullable) due date falls within the inclusive [from, to] window.
export function dueInRange(due: Date | null, from: Date, to: Date): boolean {
  return due != null && due >= from && due <= to;
}

// A derived deadline → an all-day calendar item on its due date, owned by its
// assignee (DS-14).
export function deadlineItem(
  kind: DeadlineKind,
  id: string,
  title: string,
  due: Date,
  status: string,
  clientId: string | null,
  assigneeUserId: string | null,
  /** DEP-07: the dependant a dependant procedure is for. */
  dependant: { nameEn: string; nameAr: string | null } | null = null,
): CalendarItem {
  const iso = `${due.toISOString().slice(0, 10)}T00:00:00.000Z`;
  return {
    kind,
    id,
    title,
    startAt: iso,
    endAt: iso,
    allDay: true,
    status,
    clientId,
    ownerUserId: assigneeUserId,
    step: null,
    dependant,
  };
}

// A READY step of a running onboarding / final exit (MOB-06a) → an all-day item
// on its TARGET date, owned by the run's owner. `id` is the sequence's; the step
// key (also the title — the web translates it) tells ready steps of one run apart.
export function stepItem(
  run: {
    id: string;
    kind: 'onboarding' | 'final_exit';
    employeeId: string;
    clientId: string;
    assigneeUserId: string | null;
  },
  step: { key: string; target: string },
): CalendarItem {
  const iso = `${step.target}T00:00:00.000Z`;
  return {
    kind: 'step',
    id: run.id,
    title: step.key,
    startAt: iso,
    endAt: iso,
    allDay: true,
    status: 'ready',
    clientId: run.clientId,
    ownerUserId: run.assigneeUserId,
    step: { key: step.key, sequenceKind: run.kind, employeeId: run.employeeId },
    dependant: null,
  };
}

// An own calendar event → a calendar item (carries its real start/end).
export function eventItem(e: CalendarEventRecord): CalendarItem {
  return {
    kind: 'event',
    id: e.id,
    title: e.title,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    allDay: e.allDay,
    status: null,
    clientId: e.clientId,
    ownerUserId: e.ownerUserId,
    step: null,
    dependant: null,
  };
}
