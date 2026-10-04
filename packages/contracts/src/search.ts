import { z } from 'zod';
import { leaveStatusSchema, leaveTypeSchema } from './leave.js';

// Global search (ADR-015, SEARCH-01). One result per thing found, typed by kind,
// so the screen can label each in the reader's language (no server-built text).
const names = z.object({ nameEn: z.string(), nameAr: z.string() });

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });

export const searchHitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('person'),
    id: z.uuid(),
    ...names.shape,
    jobTitleEn: z.string().nullable(),
    jobTitleAr: z.string().nullable(),
    client: names.nullable(),
    // How it matched; an identifier match names only the KIND of identifier.
    matchedOn: z.enum(['name', 'iqama', 'national_id', 'border', 'passport', 'gosi', 'work_permit']),
  }),
  z.object({ kind: z.literal('client'), id: z.uuid(), ...names.shape }),
  z.object({
    kind: z.literal('procedure'),
    id: z.uuid(),
    type: z.string(),
    status: z.string(),
    reference: z.string().nullable(),
    employee: z.object({ id: z.uuid(), ...names.shape }).nullable(),
  }),
  z.object({ kind: z.literal('task'), id: z.uuid(), title: z.string(), status: z.string() }),
  z.object({
    kind: z.literal('request'),
    id: z.uuid(),
    title: z.string(),
    type: z.string(),
    status: z.string(),
    client: names.nullable(),
  }),
  z.object({
    kind: z.literal('leave'),
    id: z.uuid(),
    ref: z.string(),
    type: leaveTypeSchema,
    status: leaveStatusSchema,
    employee: z.object({ id: z.uuid(), ...names.shape }),
  }),
]);

export const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
  // More matched than the 12 shown — the screen can say "refine your search".
  truncated: z.boolean(),
});

export type SearchHit = z.infer<typeof searchHitSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
