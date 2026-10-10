import type { DomainEvent } from '../../events/public-api';

// An employee record was created for a hire who is MOBILISING — status
// `onboarding` (MOB-04b, ADR-018; ADR-004). Owned by Employees; GRO subscribes
// and starts the onboarding sequence. Published once, when the record is made.
export class EmployeeMobilisingEvent implements DomainEvent {
  static readonly NAME = 'employee.mobilising';
  readonly name = EmployeeMobilisingEvent.NAME;

  constructor(
    readonly employeeId: string,
    readonly clientId: string,
    readonly correlationId: string | null,
  ) {}
}

// An employee went from `onboarding` to `active` — they have JOINED (MOB-04b).
// Owned by Employees, published after the commit. Recruitment reacts by carrying
// the candidate to `hired`; it subscribes BY NAME (it cannot import this module —
// see recruitment/application/employee-joined.handler.ts), so the NAME and the
// `employeeId` field are a contract a test pins. Do not rename either casually.
export class EmployeeJoinedEvent implements DomainEvent {
  static readonly NAME = 'employee.joined';
  readonly name = EmployeeJoinedEvent.NAME;

  constructor(
    readonly employeeId: string,
    readonly clientId: string,
    readonly correlationId: string | null,
  ) {}
}
