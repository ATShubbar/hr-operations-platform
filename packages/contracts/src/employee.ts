import { z } from 'zod';
import { bilingualTextSchema } from './client-company.js';

// Employees (EMP-02). Built from docs/FIELD-MAPPING.md. The response nests the
// sensitive groups so the API can redact them per capability: `salary`/`govdata`
// are `null` when the caller lacks salary.read / govdata.read.

export const genderSchema = z.enum(['male', 'female']);
export const employmentStatusSchema = z.enum(['active', 'on_leave', 'suspended', 'terminated']);
export const contractTypeSchema = z.enum([
  'unlimited',
  'fixed_term',
  'part_time',
  'temporary',
  'seasonal',
]);
export const gosiContributionBasisSchema = z.enum(['basic', 'basic_plus_housing']);
export const wpsStatusSchema = z.enum(['compliant', 'pending', 'non_compliant']);
export const exitReentryStatusSchema = z.enum(['none', 'single', 'multiple']);
export const gosiRegistrationStatusSchema = z.enum(['registered', 'pending', 'not_registered']);

// ---- salary group (salary.read / salary.update) ----
export const salaryGroupSchema = z.object({
  currency: z.string(),
  basicSalary: z.number().nullable(),
  housingAllowance: z.number().nullable(),
  transportAllowance: z.number().nullable(),
  otherAllowances: z.number().nullable(),
  gosiWage: z.number().nullable(),
  gosiContributionBasis: gosiContributionBasisSchema.nullable(),
  bankIban: z.string().nullable(),
  wpsStatus: wpsStatusSchema.nullable(),
});

// ---- govdata group (govdata.read / govdata.update) ----
// `:id` fields are identifiers (staff only); `:status` fields are expiry/status
// (a client-rep may see them for own — the `status`-tier response nulls the ids).
export const govdataGroupSchema = z.object({
  iqamaNumber: z.string().nullable(),
  nationalId: z.string().nullable(),
  borderNumber: z.string().nullable(),
  passportNumber: z.string().nullable(),
  workPermitNumber: z.string().nullable(),
  gosiRegistrationNumber: z.string().nullable(),
  absherServiceRef: z.string().nullable(),
  iqamaExpiry: z.string().nullable(),
  passportExpiry: z.string().nullable(),
  workPermitExpiry: z.string().nullable(),
  exitReentryStatus: exitReentryStatusSchema.nullable(),
  exitReentryExpiry: z.string().nullable(),
  gosiRegistrationStatus: gosiRegistrationStatusSchema.nullable(),
});

// ---- response ----
export const employeeResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  name: bilingualTextSchema,
  nationality: z.string(),
  gender: genderSchema.nullable(),
  dateOfBirth: z.string().nullable(),
  jobTitle: z.object({ ar: z.string().nullable(), en: z.string().nullable() }),
  department: z.string().nullable(),
  hireDate: z.string().nullable(),
  employmentStatus: employmentStatusSchema,
  contractType: contractTypeSchema,
  contractEndDate: z.string().nullable(),
  countsTowardSaudization: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  salary: salaryGroupSchema.nullable(), // null = redacted (no salary.read)
  govdata: govdataGroupSchema.nullable(), // null = redacted (no govdata.read)
});

export const employeeListResponseSchema = z.object({
  employees: z.array(employeeResponseSchema),
});

// ---- requests ----
// Request-side salary/govdata: all-optional groups; presence gates on
// salary.update / govdata.update at the endpoint (POST) or is its own endpoint.
const salaryWriteSchema = salaryGroupSchema.partial();
const govdataWriteSchema = govdataGroupSchema.partial();

export const createEmployeeRequestSchema = z.object({
  clientId: z.uuid(),
  name: bilingualTextSchema,
  nationality: z.string().min(2).max(2), // ISO 3166-1 alpha-2
  contractType: contractTypeSchema,
  gender: genderSchema.optional(),
  dateOfBirth: z.coerce.date().optional(),
  jobTitleAr: z.string().optional(),
  jobTitleEn: z.string().optional(),
  department: z.string().optional(),
  hireDate: z.coerce.date().optional(),
  employmentStatus: employmentStatusSchema.optional(),
  contractEndDate: z.coerce.date().optional(),
  countsTowardSaudization: z.boolean().optional(),
  salary: salaryWriteSchema.optional(), // requires salary.update
  govdata: govdataWriteSchema.optional(), // requires govdata.update
});

export const updateEmployeeCoreRequestSchema = z
  .object({
    name: bilingualTextSchema.optional(),
    nationality: z.string().min(2).max(2).optional(),
    contractType: contractTypeSchema.optional(),
    gender: genderSchema.optional(),
    dateOfBirth: z.coerce.date().optional(),
    jobTitleAr: z.string().optional(),
    jobTitleEn: z.string().optional(),
    department: z.string().optional(),
    hireDate: z.coerce.date().optional(),
    employmentStatus: employmentStatusSchema.optional(),
    contractEndDate: z.coerce.date().optional(),
    countsTowardSaudization: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const updateSalaryRequestSchema = salaryWriteSchema.refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one salary field required' },
);
export const updateGovdataRequestSchema = govdataWriteSchema.refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one govdata field required' },
);

export type Gender = z.infer<typeof genderSchema>;
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;
export type ContractType = z.infer<typeof contractTypeSchema>;
export type SalaryGroup = z.infer<typeof salaryGroupSchema>;
export type GovdataGroup = z.infer<typeof govdataGroupSchema>;
export type EmployeeResponse = z.infer<typeof employeeResponseSchema>;
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;
export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;
export type UpdateEmployeeCoreRequest = z.infer<typeof updateEmployeeCoreRequestSchema>;
export type UpdateSalaryRequest = z.infer<typeof updateSalaryRequestSchema>;
export type UpdateGovdataRequest = z.infer<typeof updateGovdataRequestSchema>;
