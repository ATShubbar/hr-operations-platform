import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import type { CreateEmployeeInput } from '../domain/employee';

// Employee registry access (EMP-01). Staff path only: staff manage all
// employees (the permissive staff RLS policy shows every row; the policy
// service authorizes them). Client-rep "read own client's employees" (matrix
// R own) and field-level redaction of salary/govdata arrive with the HTTP API
// in EMP-02.
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateEmployeeInput): Promise<EmployeeRecord> {
    return this.prisma.employee.create({ data: input });
  }

  list(): Promise<EmployeeRecord[]> {
    return this.prisma.employee.findMany({ orderBy: { nameEn: 'asc' } });
  }

  listByClient(clientId: string): Promise<EmployeeRecord[]> {
    return this.prisma.employee.findMany({ where: { clientId }, orderBy: { nameEn: 'asc' } });
  }

  getById(id: string): Promise<EmployeeRecord | null> {
    return this.prisma.employee.findUnique({ where: { id } });
  }
}
