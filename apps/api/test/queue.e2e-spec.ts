import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DISPATCH_QUEUE, DispatchWorkerModule } from '../src/modules/queue/public-api';

// NOTIF-01: the BullMQ dispatch backbone, proven end-to-end against the real
// Redis (docker compose). A job enqueued on the dispatch queue is picked up and
// processed by the worker; the app shuts the worker down cleanly on close.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('BullMQ dispatch infra (NOTIF-01, e2e)', () => {
  let app: INestApplication;
  let queue: Queue;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DispatchWorkerModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
    queue = app.get<Queue>(getQueueToken(DISPATCH_QUEUE));
    await queue.drain(); // clear any stale jobs from prior runs
  });

  afterAll(async () => {
    await app.close(); // must return promptly — proves the worker closed
  });

  it('a job enqueued on the dispatch queue is processed by the worker', async () => {
    const job = await queue.add('probe', { hello: 'notif-01' });

    // poll until the worker finishes the job
    let state = await job.getState();
    for (let i = 0; i < 100 && (state === 'waiting' || state === 'active' || state === 'delayed'); i++) {
      await sleep(50);
      state = await job.getState();
    }
    expect(state).toBe('completed');

    // the worker ran with OUR payload (echoed back as the job return value)
    const done = await queue.getJob(job.id!);
    expect(done?.returnvalue).toEqual({ handled: true, echo: { hello: 'notif-01' } });
  });

  it('processes several jobs', async () => {
    const jobs = await Promise.all(
      [1, 2, 3].map((n) => queue.add('probe', { n })),
    );
    for (const job of jobs) {
      let state = await job.getState();
      for (let i = 0; i < 100 && state !== 'completed' && state !== 'failed'; i++) {
        await sleep(50);
        state = await job.getState();
      }
      expect(state).toBe('completed');
    }
  });
});
