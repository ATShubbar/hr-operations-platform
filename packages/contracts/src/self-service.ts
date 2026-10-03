import { z } from 'zod';
import { contractTypeSchema, employmentStatusSchema, genderSchema } from './employee.js';

// Employee self-service (ADR-011, SS-03): what an employee sees of THEIR OWN
// record via GET /me. A WHITELIST, deliberately not the staff EmployeeResponse
// with fields nulled: a field added to the staff shape must not reach employees
// by default. Every field here was decided in SS-03's card.
//
// Left OUT on purpose — the employer's / consultancy's working fields, not facts
// about the person: Saudization classification, Absher service reference, WPS
// status, GOSI contribution basis, record timestamps.

const bilingual = z.object({ ar: z.string(), en: z.string() });
const bilingualOptional = z.object({ ar: z.string().nullable(), en: z.string().nullable() });

export const selfProfileResponseSchema = z.object({
  id: z.uuid(),
  name: bilingual,
  nationality: z.string(),
  gender: genderSchema.nullable(),
  dateOfBirth: z.string().nullable(),
  company: bilingual,
  jobTitle: bilingualOptional,
  department: z.string().nullable(),
  hireDate: z.string().nullable(),
  employmentStatus: employmentStatusSchema,
  contractType: contractTypeSchema,
  contractEndDate: z.string().nullable(),
  // The employee's own identifiers, WITH numbers (ADR-011: their data; PDPL
  // right of access).
  identifiers: z.object({
    iqamaNumber: z.string().nullable(),
    iqamaExpiry: z.string().nullable(),
    nationalId: z.string().nullable(),
    borderNumber: z.string().nullable(),
    passportNumber: z.string().nullable(),
    passportExpiry: z.string().nullable(),
    workPermitNumber: z.string().nullable(),
    workPermitExpiry: z.string().nullable(),
    gosiRegistrationNumber: z.string().nullable(),
    gosiRegistrationStatus: z.string().nullable(),
    exitReentryStatus: z.string().nullable(),
    exitReentryExpiry: z.string().nullable(),
  }),
  pay: z.object({
    currency: z.string(),
    basicSalary: z.number().nullable(),
    housingAllowance: z.number().nullable(),
    transportAllowance: z.number().nullable(),
    otherAllowances: z.number().nullable(),
    gosiWage: z.number().nullable(),
    // MASKED to the last 4 characters (SS-03): the employee's own account, but a
    // stolen session should not reveal it whole.
    bankIbanLast4: z.string().nullable(),
  }),
});

export type SelfProfileResponse = z.infer<typeof selfProfileResponseSchema>;
