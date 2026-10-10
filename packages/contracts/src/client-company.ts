import { z } from 'zod';
import {
  CLIENT_CITIES,
  CLIENT_PORTALS,
  CLIENT_SECTORS,
  MAX_SIGNATORIES,
  NITAQAT_BANDS,
  RESPONSE_COMMITMENTS,
  SERVICE_TIERS,
} from './client-profile.js';

export const bilingualTextSchema = z.object({
  ar: z.string().min(1),
  en: z.string().min(1),
});

export const clientStatusSchema = z.enum(['active', 'inactive']);

export const clientCompanySchema = z.object({
  id: z.uuid(),
  name: bilingualTextSchema,
  status: clientStatusSchema,
});

// ---------------------------------------------------------------------------
// The client profile (PROF-01, ADR-019). Every field is OPTIONAL — existing
// clients predate them — and a missing value is `null` in a response.
// ---------------------------------------------------------------------------

export const clientCitySchema = z.enum(CLIENT_CITIES);
export const clientSectorSchema = z.enum(CLIENT_SECTORS);
export const nitaqatBandSchema = z.enum(NITAQAT_BANDS);
export const clientPortalSchema = z.enum(CLIENT_PORTALS);
export const serviceTierSchema = z.enum(SERVICE_TIERS);
export const responseCommitmentSchema = z.enum(RESPONSE_COMMITMENTS);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = z
  .string()
  .regex(DATE_RE, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

/** Trimmed free text; an empty string is refused (send null to clear). */
const text = (max: number) => z.string().trim().min(1).max(max);

// A commercial registration is ten digits; a VAT number fifteen.
const crNumber = z.string().regex(/^\d{10}$/, 'A commercial registration is 10 digits');
const vatNumber = z.string().regex(/^\d{15}$/, 'A VAT number is 15 digits');
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d][\d\s-]{5,24}$/, 'Not a phone number');

export const clientSignatorySchema = z.strictObject({ name: text(120), role: text(120) });

// WRITE shape of the profile — shared by create and update. STRICT at every
// level, so a misspelt field is a 400 and never a silent no-op. Each nested
// group is partial: send only what changes. `null` clears a value.
const profileWriteFields = {
  crNumber: crNumber.nullable().optional(),
  city: clientCitySchema.nullable().optional(),
  sector: clientSectorSchema.nullable().optional(),
  // A band always travels with the day it was read off Qiwa; null clears both.
  nitaqat: z.strictObject({ band: nitaqatBandSchema, checkedOn: dateOnly }).nullable().optional(),
  registrations: z
    .strictObject({
      qiwaEstablishment: text(40).nullable().optional(),
      gosiEstablishment: text(40).nullable().optional(),
      vatNumber: vatNumber.nullable().optional(),
    })
    .optional(),
  contact: z
    .strictObject({
      nameEn: text(120).nullable().optional(),
      nameAr: text(120).nullable().optional(),
      role: text(120).nullable().optional(),
      email: z.email().max(254).nullable().optional(),
      phone: phone.nullable().optional(),
    })
    .optional(),
  // The WHOLE list, in order — it is replaced, not patched.
  signatories: z.array(clientSignatorySchema).max(MAX_SIGNATORIES).optional(),
  // Names of portals only (never a credential). The whole list; no repeats.
  portals: z
    .array(clientPortalSchema)
    .refine((list) => new Set(list).size === list.length, 'A portal is listed twice')
    .optional(),
  service: z
    .strictObject({
      officerUserId: z.uuid().nullable().optional(),
      tier: serviceTierSchema.nullable().optional(),
      responseCommitment: responseCommitmentSchema.nullable().optional(),
      termStart: dateOnly.nullable().optional(),
      termEnd: dateOnly.nullable().optional(),
    })
    .refine(
      (v) =>
        !(v.termStart instanceof Date && v.termEnd instanceof Date) || v.termEnd >= v.termStart,
      'The term cannot end before it starts',
    )
    .optional(),
};

// Client management API (CLIENT-02; the profile since PROF-01).
export const createClientRequestSchema = z.strictObject({
  name: bilingualTextSchema,
  status: clientStatusSchema.optional(),
  ...profileWriteFields,
});

export const updateClientRequestSchema = z
  .strictObject({
    name: bilingualTextSchema.optional(),
    status: clientStatusSchema.optional(),
    ...profileWriteFields,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to change',
  });

// READ shape. Dates are YYYY-MM-DD. The named officer is a NAME and a role —
// `officerUserId` is null for a client manager reading their own company (the
// portal), who has no use for a staff account id.
export const clientResponseSchema = clientCompanySchema.extend({
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(),
  crNumber: z.string().nullable(),
  city: clientCitySchema.nullable(),
  sector: clientSectorSchema.nullable(),
  nitaqat: z.object({ band: nitaqatBandSchema, checkedOn: z.string() }).nullable(),
  registrations: z.object({
    qiwaEstablishment: z.string().nullable(),
    gosiEstablishment: z.string().nullable(),
    vatNumber: z.string().nullable(),
  }),
  contact: z.object({
    nameEn: z.string().nullable(),
    nameAr: z.string().nullable(),
    role: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  signatories: z.array(z.object({ name: z.string(), role: z.string() })),
  portals: z.array(clientPortalSchema),
  service: z.object({
    officerUserId: z.uuid().nullable(),
    officer: z.object({ name: z.string().nullable(), role: z.string() }).nullable(),
    tier: serviceTierSchema.nullable(),
    responseCommitment: responseCommitmentSchema.nullable(),
    termStart: z.string().nullable(),
    termEnd: z.string().nullable(),
  }),
});

export const clientListResponseSchema = z.object({
  clients: z.array(clientResponseSchema),
});

export type BilingualText = z.infer<typeof bilingualTextSchema>;
export type ClientStatus = z.infer<typeof clientStatusSchema>;
export type ClientCompany = z.infer<typeof clientCompanySchema>;
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;
export type ClientResponse = z.infer<typeof clientResponseSchema>;
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
export type ClientSignatory = z.infer<typeof clientSignatorySchema>;
