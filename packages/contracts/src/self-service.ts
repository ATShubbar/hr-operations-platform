import { z } from 'zod';
import { documentCategorySchema } from './document.js';
import { contractTypeSchema, employmentStatusSchema, genderSchema } from './employee.js';
import { requestStatusSchema, requestTypeSchema } from './request.js';

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

// An employee's own document (SS-04). A whitelist like the profile: what a
// person needs to recognise a document and download it — not the registry's
// working fields (storage key, legal hold, uploader, size, status, ids,
// timestamps). Status is always `available` on this surface, so it is not sent.
export const selfDocumentResponseSchema = z.object({
  id: z.uuid(),
  category: documentCategorySchema,
  title: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
});

export const selfDocumentListResponseSchema = z.object({
  documents: z.array(selfDocumentResponseSchema),
});

export type SelfDocumentResponse = z.infer<typeof selfDocumentResponseSchema>;
export type SelfDocumentListResponse = z.infer<typeof selfDocumentListResponseSchema>;

// Raising a request (SS-05). The employee chooses ONLY what the request is
// about; the company (their own record's), status (open), priority (normal),
// due date and assignee are not theirs to set — and the database refuses an
// insert that tries (the employee_raise policy). `.strict()` rejects any other
// key rather than silently dropping it, so a client that sends `status` learns
// it is not allowed.
export const createSelfRequestRequestSchema = z
  .object({
    type: requestTypeSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
  })
  .strict();

// An employee's own request, as they see it: what they asked and where it
// stands. Priority, due date, assignee and ids are staff triage — not sent.
export const selfRequestResponseSchema = z.object({
  id: z.uuid(),
  type: requestTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: requestStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const selfRequestListResponseSchema = z.object({
  requests: z.array(selfRequestResponseSchema),
});

export type CreateSelfRequestRequest = z.infer<typeof createSelfRequestRequestSchema>;
export type SelfRequestResponse = z.infer<typeof selfRequestResponseSchema>;
export type SelfRequestListResponse = z.infer<typeof selfRequestListResponseSchema>;

// ---- Employee accounts (SS-06a) — staff-managed ----------------------------

// Invite (or re-invite) an employee to self-service: the address the link goes
// to. Everything else — the employee, their company, the account's role — is
// fixed by the server.
export const inviteEmployeeAccountRequestSchema = z.object({ email: z.email().max(254) }).strict();

export const employeeAccountStatusSchema = z.enum(['invited', 'active', 'disabled']);

export const employeeAccountResponseSchema = z.object({
  employeeId: z.uuid(),
  email: z.string(),
  status: employeeAccountStatusSchema,
  // Whether the holder has ever set a password (an `invited` account has not).
  passwordSet: z.boolean(),
  // Invite only: whether the email left the server. A failed send leaves the
  // invitation valid — staff can resend.
  emailSent: z.boolean().optional(),
});

// Deactivate or reactivate. Reactivating returns the account to `active` if a
// password was ever set, otherwise to `invited`.
export const updateEmployeeAccountRequestSchema = z
  .object({ status: z.enum(['active', 'disabled']) })
  .strict();

// "Forgot password" — always answered the same way, whether or not the address
// belongs to an account.
export const passwordResetRequestSchema = z.object({ email: z.string().max(254) }).strict();

export type InviteEmployeeAccountRequest = z.infer<typeof inviteEmployeeAccountRequestSchema>;
export type EmployeeAccountStatus = z.infer<typeof employeeAccountStatusSchema>;
export type EmployeeAccountResponse = z.infer<typeof employeeAccountResponseSchema>;
export type UpdateEmployeeAccountRequest = z.infer<typeof updateEmployeeAccountRequestSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
