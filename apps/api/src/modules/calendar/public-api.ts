// Public surface of the calendar module (ADR-003; ACTION-PLAN 5.2).
export { CalendarModule } from './calendar.module';
export { CalendarService } from './application/calendar.service';
export type { CreateCalendarEventInput, UpdateCalendarEventInput } from './domain/calendar-event';
