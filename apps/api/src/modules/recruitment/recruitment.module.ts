import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { VacanciesService } from './application/vacancies.service';

// Recruitment module (ACTION-PLAN 4.1; ADR-003 layout). REC-01 stands up the
// vacancy foundation — the client-scoped rec_vacancies table + staff-path
// VacanciesService (audited CRUD). REC-02 adds the HTTP API (staff CRUD +
// vacancy.approve, and the client-rep read-own path); REC-03/04 add candidates.
// AuditModule provides the transactional audit; Prisma is @Global.
@Module({
  imports: [AuditModule],
  providers: [VacanciesService],
  exports: [VacanciesService],
})
export class RecruitmentModule {}
