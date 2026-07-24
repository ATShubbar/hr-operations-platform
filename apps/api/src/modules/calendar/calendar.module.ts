import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { CalendarService } from './application/calendar.service';

// Calendar module (ACTION-PLAN 5.2; ADR-003 layout). CAL-01 stands up the event
// foundation — the staff-owned cal_events table + CalendarService (audited CRUD).
// CAL-02 adds the HTTP API (own-scoped event CRUD + the calendar-view endpoint that
// merges Tasks/Requests/GRO deadlines read-only). A delivery-layer module: it owns
// its events but reads deadlines from the domain modules below it. AuditModule
// provides the transactional audit; Prisma is @Global.
@Module({
  imports: [AuditModule],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
