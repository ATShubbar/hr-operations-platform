import type { DomainEvent } from '../../events/public-api';

// A candidate reached the `hired` stage (REC-05, ADR-004). Owned by the
// Recruitment module; the Employees module subscribes and creates the employee
// record — Recruitment stays ignorant of Employees (adding that consumer touches
// no recruitment code). This is an INTERNAL in-process event, so it may carry the
// candidate's name (the no-PII rule governs EXTERNAL/calendar payloads, not the
// internal bus). Published at most once per candidate: `hired` is terminal, so the
// stage transition that raises it can only succeed once.
export class CandidateHiredEvent implements DomainEvent {
  static readonly NAME = 'candidate.hired';
  readonly name = CandidateHiredEvent.NAME;

  constructor(
    readonly candidateId: string,
    readonly clientId: string,
    readonly vacancyId: string,
    readonly nameAr: string,
    readonly nameEn: string,
    readonly nationality: string,
    readonly correlationId: string | null,
  ) {}
}
