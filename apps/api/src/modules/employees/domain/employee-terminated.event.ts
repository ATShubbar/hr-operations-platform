import type { DomainEvent } from '../../events/public-api';

// An employee record became `terminated` (SS-06a, ADR-004). Owned by Employees;
// the self-service module subscribes and closes the employee's account (disable +
// end every session) — Employees stays ignorant of accounts, and Auth (a
// foundation module) never subscribes to a domain event (ADR-011 layering).
// Published once per transition INTO terminated, after the commit.
export class EmployeeTerminatedEvent implements DomainEvent {
  static readonly NAME = 'employee.terminated';
  readonly name = EmployeeTerminatedEvent.NAME;

  constructor(
    readonly employeeId: string,
    readonly clientId: string,
    readonly correlationId: string | null,
  ) {}
}
