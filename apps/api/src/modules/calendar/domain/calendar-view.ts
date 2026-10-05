import { isFinished, type CalendarItem, type CalendarItemKind, type WorkKind } from '@hr/contracts';
import type { CalendarEventModel as CalendarEventRecord } from '../../../generated/prisma/models';

// Calendar-view aggregation helpers (CAL-02). The view merges own calendar events
// with read-only ACTIVE deadlines from Tasks/Requests/GRO — finished items are
// excluded so the calendar shows only work that still has a live deadline.
// "Finished" is the ONE shared definition (CAL-04, @hr/contracts/work-status) —
// the queue and overviews use the same, so the screens can't disagree.

const KIND: Record<Exclude<CalendarItemKind, 'event'>, WorkKind> = {
  task: 'task',
  request: 'request',
  gro: 'procedure',
};

export function isActiveDeadline(
  kind: Exclude<CalendarItemKind, 'event'>,
  status: string,
): boolean {
  return !isFinished(KIND[kind], status);
}

// Whether a (nullable) due date falls within the inclusive [from, to] window.
export function dueInRange(due: Date | null, from: Date, to: Date): boolean {
  return due != null && due >= from && due <= to;
}

// A derived deadline → an all-day calendar item on its due date, owned by its
// assignee (DS-14).
export function deadlineItem(
  kind: Exclude<CalendarItemKind, 'event'>,
  id: string,
  title: string,
  due: Date,
  status: string,
  clientId: string | null,
  assigneeUserId: string | null,
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
  };
}
