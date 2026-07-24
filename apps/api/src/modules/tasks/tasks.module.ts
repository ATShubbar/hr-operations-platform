import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { AuthModule } from '../auth/public-api';
import { TasksController } from './api/tasks.controller';
import { TasksService } from './application/tasks.service';
import { RequestCreatedHandler } from './application/request-created.handler';

// Tasks module (ACTION-PLAN 4.4; ADR-003 layout). TASK-02 adds the staff-only
// HTTP API with the matrix "own/assigned" scope (PolicyService checks
// task.read-all). The Requests→Tasks event consumer lands in TASK-03. AuthModule
// provides PolicyService; AuditModule the transactional audit; Prisma is @Global.
@Module({
  imports: [AuditModule, AuthModule],
  controllers: [TasksController],
  providers: [TasksService, RequestCreatedHandler],
  exports: [TasksService],
})
export class TasksModule {}
