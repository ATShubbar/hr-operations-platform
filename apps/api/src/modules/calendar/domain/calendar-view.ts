import type { CalendarItem, CalendarItemKind } from '@hr/contracts';
import type { CalendarEventModel as CalendarEventRecord } from '../../../generated/prisma/models';

// Calendar-view aggregation helpers (CAL-02). The view merges own calendar events
// with read-only ACTIVE deadlines from Tasks/Requests/GRO — terminal (done/closed/
// cancelled/completed/rejected) items are excluded so the calendar shows only work
// that still has a live deadline.

const TERMINAL: Record<Exclude<CalendarItemKind, 'event'>, ReadonlySet<string>> = {
  task: new Set(['done', 'cancelled']),
  request: new Set(['closed', 'cancelled']),
  gro: new Set(['completed', 'rejected', 'cancelled']),
};

export function isActiveDeadline(kind: Exclude<CalendarItemKind, 'event'>, status: string): boolean {
  return !TERMINAL[kind].has(status);
}

// Whether a (nullable) due date falls within the inclusive [from, to] window.
export function dueInRange(due: Date | null, from: Date, to: Date): boolean {
  return due != null && due >= from && due <= to;
}

// A derived deadline → an all-day calendar item on its due date.
export function deadlineItem(
  kind: Exclude<CalendarItemKind, 'event'>,
  id: string,
  title: string,
  due: Date,
  status: string,
  clientId: string | null,
): CalendarItem {
  const iso = `${due.toISOString().slice(0, 10)}T00:00:00.000Z`;
  return { kind, id, title, startAt: iso, endAt: iso, allDay: true, status, clientId };
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
  };
}
