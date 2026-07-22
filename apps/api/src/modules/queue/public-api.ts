// Public surface of the queue module (ADR-003). The async-dispatch backbone:
// modules register/inject BullMQ queues (via @nestjs/bullmq) and enqueue onto
// the shared `dispatch` queue.
export { QueueModule } from './queue.module';
export { DISPATCH_QUEUE } from './queue.constants';
