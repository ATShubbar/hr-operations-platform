import { BullModule } from '@nestjs/bullmq';
import { Global, Injectable, Module, type BeforeApplicationShutdown } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Queue } from 'bullmq';
import { DISPATCH_QUEUE, EXPIRY_QUEUE, LEAVE_QUEUE } from './queue.constants';

// Async dispatch backbone (NOTIF-01). BullMQ over the existing Redis (Redis is
// never a source of truth — sessions, cache, queues only). @Global so any module
// can enqueue onto the shared `dispatch` queue (NOTIF-02+). This module is the
// PRODUCER side only — it holds no blocking connection, so it is safe in every
// test. The consumer (DispatchWorkerModule) runs only in the real process and
// the queue e2e, so BullMQ's blocking worker connection isn't started/torn down
// in every spec (which otherwise emits benign "Connection is closed" noise).
// The split alone did not end that noise for the PRODUCER queues — see
// QueueShutdownGuard below.
// Every part of REDIS_URL must survive: GCP-04's first deploy kept only host +
// port, and the worker was refused ("NOAUTH") by the password-protected UAT
// Redis while the session store, which takes the URL whole, connected fine.
export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  const db = Number(url.pathname.slice(1));
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(db > 0 && { db }),
    // BullMQ workers issue blocking commands; the per-request retry cap MUST be
    // disabled or the worker throws on startup.
    maxRetriesPerRequest: null,
  };
}

// HARNESS-01: closing a queue that is still CONNECTING crashes BullMQ 5.80.
// Its init() sends INFO and catches a failure with `emit('error')`, but close()
// has meanwhile removed every listener — so the INFO that fails with
// "Connection is closed." makes emit('error') THROW inside that catch, an
// unhandled rejection. Any app closed within milliseconds of starting hit it
// (the e2e suite's quick specs: ~3 runs in 10 went red with 515/515 passing).
// @nestjs/bullmq closes queues in onApplicationShutdown; Nest runs every
// beforeApplicationShutdown first, so waiting here for the queues to finish
// connecting means close() always takes its clean path. Connection errors are
// ignored: shutdown must not fail because Redis was unreachable.
//
// EVERY queue the app created, found through Nest's discovery service — not a
// hand-kept list: NotificationsModule registers its own `dispatch` instance (a
// separate connection), and a two-queue list missed it.
@Injectable()
class QueueShutdownGuard implements BeforeApplicationShutdown {
  constructor(private readonly discovery: DiscoveryService) {}

  async beforeApplicationShutdown(): Promise<void> {
    const queues = new Set(
      this.discovery
        .getProviders()
        .map((w) => w.instance as unknown)
        .filter((i): i is Queue => i instanceof Queue),
    );
    await Promise.all([...queues].map((q) => q.waitUntilReady().catch(() => undefined)));
  }
}

@Global()
@Module({
  providers: [QueueShutdownGuard],
  imports: [
    DiscoveryModule,
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: DISPATCH_QUEUE }, { name: EXPIRY_QUEUE }, { name: LEAVE_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
