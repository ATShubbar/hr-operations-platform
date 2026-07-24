import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CandidateHiredEvent } from '../../recruitment/public-api';
import { EmployeesService } from './employees.service';

// Employees subscribes to the candidate-hired fact (REC-05, ADR-004) — a hired
// candidate becomes an employee record. Recruitment never imports Employees;
// adding this consumer touched no recruitment code. The record is a STARTING POINT:
// name + client + nationality come from the candidate; contractType defaults to
// `unlimited` (a valid onboarding default HR adjusts) and employmentStatus to
// `active`. Salary/govdata are filled in by HR afterward. EmployeesService.create
// audits the row (employee.create). `hired` is terminal, so the event — and thus
// this employee — is created at most once per candidate.
@Injectable()
export class CandidateHiredHandler {
  constructor(private readonly employees: EmployeesService) {}

  @OnEvent(CandidateHiredEvent.NAME)
  async handle(event: CandidateHiredEvent): Promise<void> {
    await this.employees.create({
      clientId: event.clientId,
      nameAr: event.nameAr,
      nameEn: event.nameEn,
      nationality: event.nationality,
      contractType: 'unlimited',
      employmentStatus: 'active',
    });
  }
}
