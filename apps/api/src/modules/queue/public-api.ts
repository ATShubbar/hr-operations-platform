// Public surface of the queue module (ADR-003). The async-dispatch backbone:
// modules register/inject BullMQ queues (via @nestjs/bullmq) and enqueue onto
// the shared `dispatch` queue.
export { QueueModule, redisConnection } from './queue.module';
export { DISPATCH_QUEUE, EXPIRY_QUEUE, LEAVE_QUEUE } from './queue.constants';
