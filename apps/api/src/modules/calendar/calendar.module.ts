import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { TasksModule } from '../tasks/public-api';
import { RequestsModule } from '../requests/public-api';
import { GroModule } from '../gro/public-api';
import { CalendarController } from './api/calendar.controller';
import { CalendarService } from './application/calendar.service';

// Calendar module (ACTION-PLAN 5.2; ADR-003 layout). A delivery-layer module: it
// owns its events (cal_events) but READS deadlines from the domain modules below it.
// CAL-02 adds the HTTP API — own-scoped event CRUD (calendar.read-all lifts scope,
// via AuthModule's PolicyService) + the calendar-view endpoint that merges Tasks/
// Requests/GRO deadlines read-only. Those imports are one-way (none import Calendar),
// so no cycle. AuditModule provides the transactional audit; Prisma is @Global.
@Module({
  imports: [AuditModule, AuthModule, TasksModule, RequestsModule, GroModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
