import { z } from 'zod';

// Recruitment vacancies (REC-02; ACTION-PLAN 4.1). A vacancy is an open position
// the consultancy recruits for AT a client company. Job titles are bilingual
// (ar/en), matching official Saudi documents. Status advances via the workflow
// (POST /vacancies/:id/status, gated by vacancy.approve).
export const vacancyStatusSchema = z.enum(['draft', 'open', 'filled', 'closed', 'cancelled']);

// The hiring pipeline of one vacancy (DS-18): how many candidates sit at each
// stage still on the board. COUNTS ONLY — a client manager reads these for their
// own roles but never a candidate (REC-03). Rejected / withdrawn candidates have
// left the board and are not counted.
export const vacancyPipelineSchema = z.object({
  applied: z.number().int(),
  screening: z.number().int(),
  interview: z.number().int(),
  offer: z.number().int(),
  hired: z.number().int(),
});

export const vacancyResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  title: z.object({ ar: z.string(), en: z.string() }),
  description: z.string().nullable(),
  department: z.string().nullable(),
  headcount: z.number().int(),
  status: vacancyStatusSchema,
  openedByUserId: z.uuid().nullable(),
  pipeline: vacancyPipelineSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create: staff supply `clientId` (validated); client reps never create vacancies
// (they only read). `status` is never set on create — a vacancy always starts
// `draft`. Bilingual title required.
export const createVacancyRequestSchema = z.object({
  clientId: z.uuid(),
  title: z.object({ ar: z.string().min(1).max(200), en: z.string().min(1).max(200) }),
  description: z.string().max(2000).optional(),
  department: z.string().max(120).optional(),
  headcount: z.number().int().min(1).max(999).optional(),
});

// Update: editable core fields only — status is advanced via vacancy.approve.
export const updateVacancyRequestSchema = z.object({
  title: z.object({ ar: z.string().min(1).max(200), en: z.string().min(1).max(200) }).optional(),
  description: z.string().max(2000).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  headcount: z.number().int().min(1).max(999).optional(),
});

// Status transition (vacancy.approve): advance status, validated server-side
// against the workflow. Staff only.
export const changeVacancyStatusRequestSchema = z.object({
  status: vacancyStatusSchema,
});

export const vacancyListResponseSchema = z.object({
  vacancies: z.array(vacancyResponseSchema),
});

// Staff list filter: an optional clientId (client reps are always own-scoped).
export const vacancyQuerySchema = z.object({
  clientId: z.uuid().optional(),
});

export type VacancyStatus = z.infer<typeof vacancyStatusSchema>;
export type VacancyPipeline = z.infer<typeof vacancyPipelineSchema>;
export type VacancyResponse = z.infer<typeof vacancyResponseSchema>;
export type CreateVacancyRequest = z.infer<typeof createVacancyRequestSchema>;
export type UpdateVacancyRequest = z.infer<typeof updateVacancyRequestSchema>;
export type ChangeVacancyStatusRequest = z.infer<typeof changeVacancyStatusRequestSchema>;
export type VacancyListResponse = z.infer<typeof vacancyListResponseSchema>;
export type VacancyQuery = z.infer<typeof vacancyQuerySchema>;
