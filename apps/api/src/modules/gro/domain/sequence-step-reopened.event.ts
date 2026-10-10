import type { DomainEvent } from '../../events/public-api';

// A filed sequence step was REOPENED (BILL-02, ADR-020; an ADR-004 flow).
// Published by GRO after the reopen commits. Billing subscribes and voids the
// fee recorded for that step — GRO itself knows nothing about fees.
export class SequenceStepReopenedEvent implements DomainEvent {
  static readonly NAME = 'gro.sequence-step.reopened';
  readonly name = SequenceStepReopenedEvent.NAME;

  constructor(
    readonly sequenceId: string,
    readonly stepKey: string,
    readonly employeeId: string,
    readonly clientId: string,
    readonly correlationId: string | null,
  ) {}
}
