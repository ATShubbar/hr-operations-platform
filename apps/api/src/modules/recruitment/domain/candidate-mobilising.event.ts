import type { DomainEvent } from '../../events/public-api';

// A candidate entered Visa & mobilisation (MOB-04b, ADR-018; ADR-004). Owned by
// Recruitment. Employees subscribes and creates the employee record as
// `onboarding` — with the id Recruitment MINTED (`employeeId`), so the candidate
// already points at its employee when this is published and no reply is needed.
// Published once per candidate: there is no way back into `mobilisation`.
export class CandidateMobilisingEvent implements DomainEvent {
  static readonly NAME = 'candidate.mobilising';
  readonly name = CandidateMobilisingEvent.NAME;

  constructor(
    readonly candidateId: string,
    readonly employeeId: string,
    readonly clientId: string,
    readonly vacancyId: string,
    readonly nameAr: string,
    readonly nameEn: string,
    readonly nationality: string,
    readonly correlationId: string | null,
  ) {}
}

// A candidate left Visa & mobilisation WITHOUT being hired — withdrawn or rejected
// (MOB-04b). Employees subscribes and terminates the record made for them; that
// termination in turn cancels the onboarding (GRO) and closes any account
// (self-service), as for any terminated employee.
export class CandidateMobilisationEndedEvent implements DomainEvent {
  static readonly NAME = 'candidate.mobilisation-ended';
  readonly name = CandidateMobilisationEndedEvent.NAME;

  constructor(
    readonly candidateId: string,
    readonly employeeId: string,
    readonly clientId: string,
    readonly correlationId: string | null,
  ) {}
}
