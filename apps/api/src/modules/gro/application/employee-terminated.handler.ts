import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmployeeTerminatedEvent } from '../../employees/public-api';
import { SequencesService } from './sequences.service';

// GRO subscribes to "an employee was terminated" (MOB-04a, ADR-018; ADR-004): a
// running ONBOARDING for them is cancelled — whoever terminated them, by whichever
// path. Employees publishes the fact and knows nothing of sequences; GRO already
// depends on Employees, so this is the same one-way direction. Self-service
// consumes the same event to close the account (SS-06a).
@Injectable()
export class EmployeeTerminatedHandler {
  private readonly logger = new Logger(EmployeeTerminatedHandler.name);

  constructor(private readonly sequences: SequencesService) {}

  @OnEvent(EmployeeTerminatedEvent.NAME)
  async handle(event: EmployeeTerminatedEvent): Promise<void> {
    const cancelled = await this.sequences.cancelOnboardingOnTermination(event.employeeId);
    if (cancelled)
      this.logger.log(
        `Cancelled ${cancelled} onboarding sequence(s) of terminated employee ${event.employeeId}`,
      );
  }
}
