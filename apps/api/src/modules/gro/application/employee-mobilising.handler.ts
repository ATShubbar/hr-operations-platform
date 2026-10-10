import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmployeeMobilisingEvent } from '../../employees/public-api';
import { SequencesService } from './sequences.service';

// GRO subscribes to "an employee record was made for a mobilising hire" (MOB-04b,
// ADR-018; ADR-004) and starts their onboarding sequence — the Hiring board's
// Visa & mobilisation column doing its work. One-way: GRO already depends on
// Employees. Safe to repeat: a second running onboarding is refused (409) by the
// service and by the database index, and is ignored here.
@Injectable()
export class EmployeeMobilisingHandler {
  private readonly logger = new Logger(EmployeeMobilisingHandler.name);

  constructor(private readonly sequences: SequencesService) {}

  @OnEvent(EmployeeMobilisingEvent.NAME)
  async handle(event: EmployeeMobilisingEvent): Promise<void> {
    try {
      await this.sequences.start(event.employeeId, 'onboarding');
    } catch (err) {
      if ((err as { status?: number }).status === 409) return; // already running
      throw err;
    }
    this.logger.log(`Started onboarding for mobilising employee ${event.employeeId}`);
  }
}
