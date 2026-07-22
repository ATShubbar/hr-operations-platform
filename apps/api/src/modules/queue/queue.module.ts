import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { DISPATCH_QUEUE } from './queue.constants';

// Async dispatch backbone (NOTIF-01). BullMQ over the existing Redis (Redis is
// never a source of truth — sessions, cache, queues only). @Global so any module
// can enqueue onto the shared `dispatch` queue (NOTIF-02+). This module is the
// PRODUCER side only — it holds no blocking connection, so it is safe in every
// test. The consumer (DispatchWorkerModule) runs only in the real process and
// the queue e2e, so BullMQ's blocking worker connection isn't started/torn down
// in every spec (which otherwise emits benign "Connection is closed" noise).
function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    // BullMQ workers issue blocking commands; the per-request retry cap MUST be
    // disabled or the worker throws on startup.
    maxRetriesPerRequest: null,
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: DISPATCH_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
