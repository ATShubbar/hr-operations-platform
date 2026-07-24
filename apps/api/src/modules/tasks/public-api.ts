// Public surface of the tasks module (ADR-003; ACTION-PLAN 4.4).
export { TasksModule } from './tasks.module';
export { TasksService } from './application/tasks.service';
export type { CreateTaskInput } from './domain/task';
// Sun–Thu working-day helpers (exported so tests + future callers use them via
// the public surface, not a deep import — the module-boundary lint rule).
export { addWorkingDays, isWorkingDay } from './domain/working-days';
