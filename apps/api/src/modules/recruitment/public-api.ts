// Public surface of the recruitment module (ADR-003; ACTION-PLAN 4.1).
export { RecruitmentModule } from './recruitment.module';
export { VacanciesService } from './application/vacancies.service';
export { CandidatesService } from './application/candidates.service';
export type { CreateVacancyInput, UpdateVacancyInput } from './domain/vacancy';
export type { CreateCandidateInput, UpdateCandidateInput } from './domain/candidate';
// The domain event this module publishes (ADR-004). Employees subscribes via
// @OnEvent(CandidateHiredEvent.NAME) and creates the employee record (REC-05).
export { CandidateHiredEvent } from './domain/candidate-hired.event';
// MOB-04b (ADR-018): Visa & mobilisation. Employees subscribes to both.
export {
  CandidateMobilisationEndedEvent,
  CandidateMobilisingEvent,
} from './domain/candidate-mobilising.event';
// The name of the Employees event Recruitment subscribes to WITHOUT importing
// Employees (ADR-018 rev. 1) — exported so a test can pin it against the real one.
export { EMPLOYEE_JOINED } from './application/employee-joined.handler';
