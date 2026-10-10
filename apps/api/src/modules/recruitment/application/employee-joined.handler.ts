import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CandidatesService } from './candidates.service';

// Recruitment learns that a mobilising hire has JOINED (MOB-04b; ADR-018 rev. 1).
//
// The fact is Employees': it publishes `EmployeeJoinedEvent` when someone goes
// from `onboarding` to `active`. Recruitment must NOT import Employees' public
// API to subscribe — Employees already imports Recruitment's (for the hire
// events), and GRO imports Employees', so that import would close a loop the
// module loader cannot resolve. So this is the one subscription BY NAME: the
// event's name and the single field read from it are declared here, and
// test/hiring-mobilisation.e2e-spec.ts fails if Employees ever renames either.
export const EMPLOYEE_JOINED = 'employee.joined';

interface EmployeeJoined {
  employeeId: string;
}

@Injectable()
export class EmployeeJoinedHandler {
  private readonly logger = new Logger(EmployeeJoinedHandler.name);

  constructor(private readonly candidates: CandidatesService) {}

  @OnEvent(EMPLOYEE_JOINED)
  async handle(event: EmployeeJoined): Promise<void> {
    const moved = await this.candidates.completeMobilisation(event.employeeId);
    if (moved)
      this.logger.log(`Candidate ${moved.id} onboarded (employee ${event.employeeId} joined)`);
  }
}
