import { z } from 'zod';

// Calendar (CAL-02; ACTION-PLAN 5.2). Staff scheduling. Events are owned by their
// creator (own-scope; calendar.read-all lifts it). The calendar VIEW merges own
// events with read-only deadlines from Tasks/Requests/GRO for a date range.
// Timestamps are ISO strings, storage UTC (Hijri is a render concern).

export const calendarEventResponseSchema = z.object({
  id: z.uuid(),
  ownerUserId: z.uuid(),
  clientId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const calendarEventListResponseSchema = z.object({
  events: z.array(calendarEventResponseSchema),
});

// Create: the owner is the caller (never input). endAt must not precede startAt.
export const createCalendarEventRequestSchema = z
  .object({
    clientId: z.uuid().optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    location: z.string().max(200).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    allDay: z.boolean().optional(),
  })
  .refine((v) => v.endAt >= v.startAt, { message: 'endAt must be on or after startAt' });

export const updateCalendarEventRequestSchema = z
  .object({
    clientId: z.uuid().nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
  })
  .refine((v) => !(v.startAt && v.endAt) || v.endAt >= v.startAt, {
    message: 'endAt must be on or after startAt',
  });

// The date-range query for list + view (both required for view).
export const calendarRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// A unified calendar item — an own event or a derived deadline. Deadlines are
// all-day on the due date and carry the source item's status.
export const calendarItemKindSchema = z.enum(['event', 'task', 'request', 'gro']);
export const calendarItemSchema = z.object({
  kind: calendarItemKindSchema,
  id: z.uuid(),
  title: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  status: z.string().nullable(), // event → null; task/request/gro → its status
  clientId: z.uuid().nullable(),
});
export const calendarViewResponseSchema = z.object({
  items: z.array(calendarItemSchema),
});

export type CalendarEventResponse = z.infer<typeof calendarEventResponseSchema>;
export type CalendarEventListResponse = z.infer<typeof calendarEventListResponseSchema>;
export type CreateCalendarEventRequest = z.infer<typeof createCalendarEventRequestSchema>;
export type UpdateCalendarEventRequest = z.infer<typeof updateCalendarEventRequestSchema>;
export type CalendarRangeQuery = z.infer<typeof calendarRangeQuerySchema>;
export type CalendarItemKind = z.infer<typeof calendarItemKindSchema>;
export type CalendarItem = z.infer<typeof calendarItemSchema>;
export type CalendarViewResponse = z.infer<typeof calendarViewResponseSchema>;
