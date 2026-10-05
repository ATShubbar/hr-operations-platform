import { z } from 'zod';

// Dependants (DEP-02, ADR-017): the family on an employee's sponsorship.
//
// Writes are STRICT (an unknown key is a 400, so a sponsor id, a removal stamp
// or anything else cannot ride along) and take dates as date-only strings —
// never a timestamp a browser's timezone could shift (GCAL-04). Responses are
// WHITELISTS: the staff view masks the iqama number for callers without
// govdata.read and says so (`identifierVisible`); the employee's own view
// always carries it (ADR-011: one's own identifiers, with numbers). Removed
// dependants and removal stamps never appear in either.

export const dependantRelationshipSchema = z.enum(['spouse', 'son', 'daughter']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = z
  .string()
  .regex(DATE_RE, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

// A Saudi iqama number: ten digits beginning with 2.
const iqamaNumber = z.string().regex(/^2\d{9}$/, 'An iqama number is 10 digits starting with 2');

const fields = {
  relationship: dependantRelationshipSchema,
  nameEn: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).nullable().optional(),
  dateOfBirth: dateOnly.nullable().optional(),
  iqamaNumber: iqamaNumber.nullable().optional(),
  iqamaExpiry: dateOnly.nullable().optional(),
  passportExpiry: dateOnly.nullable().optional(),
  insuranceExpiry: dateOnly.nullable().optional(),
};

export const createDependantSchema = z.strictObject(fields);

export const updateDependantSchema = z
  .strictObject({
    relationship: fields.relationship.optional(),
    nameEn: fields.nameEn.optional(),
    nameAr: fields.nameAr,
    dateOfBirth: fields.dateOfBirth,
    iqamaNumber: fields.iqamaNumber,
    iqamaExpiry: fields.iqamaExpiry,
    passportExpiry: fields.passportExpiry,
    insuranceExpiry: fields.insuranceExpiry,
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to change');

const view = {
  id: z.uuid(),
  relationship: dependantRelationshipSchema,
  nameEn: z.string(),
  nameAr: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  iqamaExpiry: z.string().nullable(),
  passportExpiry: z.string().nullable(),
  insuranceExpiry: z.string().nullable(),
};

/** Staff view (GET /employees/:id/dependants). */
export const dependantResponseSchema = z.strictObject({
  ...view,
  employeeId: z.uuid(),
  iqamaNumber: z.string().nullable(),
  identifierVisible: z.boolean(),
});

export const dependantListResponseSchema = z.object({
  dependants: z.array(dependantResponseSchema),
});

/** The employee's own view (GET /me/dependants): numbers included, no sponsor id. */
export const selfDependantSchema = z.strictObject({ ...view, iqamaNumber: z.string().nullable() });

export const selfDependantListResponseSchema = z.object({
  dependants: z.array(selfDependantSchema),
});

export type DependantRelationship = z.infer<typeof dependantRelationshipSchema>;
export type CreateDependant = z.infer<typeof createDependantSchema>;
export type UpdateDependant = z.infer<typeof updateDependantSchema>;
export type DependantResponse = z.infer<typeof dependantResponseSchema>;
export type DependantListResponse = z.infer<typeof dependantListResponseSchema>;
export type SelfDependant = z.infer<typeof selfDependantSchema>;
export type SelfDependantListResponse = z.infer<typeof selfDependantListResponseSchema>;
