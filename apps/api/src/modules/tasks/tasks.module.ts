import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { TasksService } from './application/tasks.service';

// Tasks module (ACTION-PLAN 4.4; ADR-003 layout). TASK-01 ships the staff-owned
// `task_tasks` registry + service. The HTTP API (own/assigned scope) lands in
// TASK-02; the Requests→Tasks event consumer in TASK-03. AuditModule provides the
// transactional audit; PrismaModule is @Global.
@Module({
  imports: [AuditModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
