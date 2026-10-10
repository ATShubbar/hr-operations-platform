import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { requestContext } from '../../../context/request-context';
import { EventBus } from '../../events/public-api';
import {
  CandidateMobilisationEndedEvent,
  CandidateMobilisingEvent,
} from '../../recruitment/public-api';
import { EmployeeMobilisingEvent } from '../domain/employee-mobilisation.event';
import { EmployeesService } from './employees.service';

// Employees reacts to the two facts Recruitment publishes about Visa &
// mobilisation (MOB-04b, ADR-018; ADR-004 — Recruitment never imports Employees).
//
//   mobilising  → create the employee record as `onboarding`, WITH THE ID
//                 RECRUITMENT MINTED (the candidate already points at it), then
//                 publish EmployeeMobilisingEvent so GRO starts the onboarding.
//   ended       → the hire was withdrawn or rejected: terminate that record. The
//                 termination event then cancels the onboarding (GRO) and closes
//                 any account (self-service), as for anyone terminated.
//
// Both are safe to repeat: an existing record is not created twice, and only a
// record still `onboarding` is terminated.
@Injectable()
export class CandidateMobilisationHandler {
  private readonly logger = new Logger(CandidateMobilisationHandler.name);

  constructor(
    private readonly employees: EmployeesService,
    private readonly events: EventBus,
  ) {}

  @OnEvent(CandidateMobilisingEvent.NAME)
  async mobilising(event: CandidateMobilisingEvent): Promise<void> {
    if (!(await this.employees.getById(event.employeeId))) {
      await this.employees.create({
        id: event.employeeId,
        clientId: event.clientId,
        nameAr: event.nameAr,
        nameEn: event.nameEn,
        nationality: event.nationality,
        contractType: 'unlimited',
        employmentStatus: 'onboarding',
      });
    }
    await this.events.publish(
      new EmployeeMobilisingEvent(
        event.employeeId,
        event.clientId,
        requestContext.get()?.requestId ?? event.correlationId,
      ),
    );
  }

  @OnEvent(CandidateMobilisationEndedEvent.NAME)
  async ended(event: CandidateMobilisationEndedEvent): Promise<void> {
    const employee = await this.employees.getById(event.employeeId);
    if (employee?.employmentStatus !== 'onboarding') return;
    await this.employees.update(event.employeeId, { employmentStatus: 'terminated' }, 'terminate');
    this.logger.log(`Terminated ${event.employeeId}: their hire ended during mobilisation`);
  }
}
