// Public surface of the recruitment module (ADR-003; ACTION-PLAN 4.1).
export { RecruitmentModule } from './recruitment.module';
export { VacanciesService } from './application/vacancies.service';
export type { CreateVacancyInput, UpdateVacancyInput } from './domain/vacancy';
