import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ClientsModule } from '../clients/public-api';
import { CandidatesController } from './api/candidates.controller';
import { VacanciesController } from './api/vacancies.controller';
import { CandidatesService } from './application/candidates.service';
import { VacanciesService } from './application/vacancies.service';

// Recruitment module (ACTION-PLAN 4.1; ADR-003 layout). Vacancies: staff CRUD +
// the vacancy.approve workflow + client-rep read-own (REC-02). Candidates
// (REC-03/04): the staff-internal pipeline registry + its HTTP API and stage
// workflow (candidate.advance). ClientsModule validates staff-supplied clientIds;
// AuditModule provides the transactional audit; Prisma/ScopedPrisma are @Global.
@Module({
  imports: [AuditModule, ClientsModule],
  controllers: [VacanciesController, CandidatesController],
  providers: [VacanciesService, CandidatesService],
  exports: [VacanciesService, CandidatesService],
})
export class RecruitmentModule {}
