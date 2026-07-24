// Public surface of the employees module (ADR-003).
export { EmployeesModule } from './employees.module';
export { EmployeesService } from './application/employees.service';
export { toEmployeeResponse, type EmployeeVisibility } from './domain/employee-view';
export type { CreateEmployeeInput } from './domain/employee';
