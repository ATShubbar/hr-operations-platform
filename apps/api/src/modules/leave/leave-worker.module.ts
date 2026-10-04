import { Module } from '@nestjs/common';
import { LeaveModule } from './leave.module';
import { LeaveCarryOverProcessor } from './worker/leave-carry-over.processor';
import { LeaveCarryOverScheduler } from './worker/leave-carry-over.scheduler';

// The leave WORKER (LEAVE-03): the yearly carry-over scheduler + its processor.
// Kept OUT of AppModule (the NOTIF producer/worker split) — loaded only by
// MainModule (the worker process), never by ordinary specs.
@Module({
  imports: [LeaveModule],
  providers: [LeaveCarryOverScheduler, LeaveCarryOverProcessor],
})
export class LeaveWorkerModule {}
