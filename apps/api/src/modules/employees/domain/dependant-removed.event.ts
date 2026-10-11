import type { DomainEvent } from '../../events/public-api';

// A dependant was removed from their sponsor's record (DEP-06a, ADR-004). Owned
// by Employees; GRO subscribes and cancels that dependant's open renewal —
// Employees knows nothing of procedures. Published once, after the removal
// commits. It carries ids only: nothing about the dependant.
export class DependantRemovedEvent implements DomainEvent {
  static readonly NAME = 'dependant.removed';
  readonly name = DependantRemovedEvent.NAME;

  constructor(
    readonly dependantId: string,
    readonly employeeId: string,
    readonly correlationId: string | null,
  ) {}
}
