import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ClientsModule } from '../clients/public-api';
import { VacanciesController } from './api/vacancies.controller';
import { VacanciesService } from './application/vacancies.service';

// Recruitment module (ACTION-PLAN 4.1; ADR-003 layout). REC-02 adds the vacancies
// HTTP API — staff CRUD + the vacancy.approve status workflow, plus the client-rep
// read-own path (RLS-enforced via ScopedPrismaService). REC-03/04 add candidates.
// ClientsModule validates staff-supplied clientIds; AuditModule provides the
// transactional audit; Prisma/ScopedPrisma are @Global.
@Module({
  imports: [AuditModule, ClientsModule],
  controllers: [VacanciesController],
  providers: [VacanciesService],
  exports: [VacanciesService],
})
export class RecruitmentModule {}
