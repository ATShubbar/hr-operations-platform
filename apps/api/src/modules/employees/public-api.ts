// Public surface of the employees module (ADR-003).
export { EmployeesModule } from './employees.module';
export { EmployeesService } from './application/employees.service';
export { DependantsService } from './application/dependants.service';
export { EmployeeTerminatedEvent } from './domain/employee-terminated.event';
export { EmployeeJoinedEvent, EmployeeMobilisingEvent } from './domain/employee-mobilisation.event';
export {
  PORTAL_EMPLOYEE_VISIBILITY,
  staffVisibility,
  toEmployeeResponse,
  toSelfProfileResponse,
  type EmployeeVisibility,
} from './domain/employee-view';
export type { CreateEmployeeInput } from './domain/employee';
export { toSelfDependant } from './domain/dependant-view';
export type { DependantInput, DependantPatch, DependantRelationship } from './domain/dependant';
