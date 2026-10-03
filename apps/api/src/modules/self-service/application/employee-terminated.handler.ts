import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmployeeTerminatedEvent } from '../../employees/public-api';
import { EmployeeAccountsService } from './employee-accounts.service';

// EmployeeTerminated → close the employee's account (SS-06a, ADR-004). The
// termination already committed; this disables the account, cancels its links
// and ends every session. Idempotent — a record terminated twice, or one with no
// account, is a no-op.
@Injectable()
export class EmployeeTerminatedHandler {
  constructor(private readonly accounts: EmployeeAccountsService) {}

  @OnEvent(EmployeeTerminatedEvent.NAME)
  async handle(event: EmployeeTerminatedEvent): Promise<void> {
    await this.accounts.closeForTerminated(event.employeeId, event.clientId);
  }
}
