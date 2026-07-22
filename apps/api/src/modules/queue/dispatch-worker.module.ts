import { Module } from '@nestjs/common';
import { DispatchProcessor } from './dispatch.processor';

// The dispatch CONSUMER (NOTIF-01). Kept separate from QueueModule so the BullMQ
// worker — which holds a blocking Redis connection — runs only where it's meant
// to: the real process (via MainModule) and the queue e2e. Ordinary specs boot
// AppModule without it, so no blocking connection is opened and closed per file.
// Uses the global BullMQ root config from QueueModule.
@Module({
  providers: [DispatchProcessor],
})
export class DispatchWorkerModule {}
