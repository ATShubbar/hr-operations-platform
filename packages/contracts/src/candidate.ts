import { z } from 'zod';

// Recruitment candidates (REC-04; ACTION-PLAN 4.1). Staff-internal — clients never
// see candidates. A candidate is a person in the pipeline for a vacancy; names are
// bilingual (ar/en). Stage advances via the workflow (POST /candidates/:id/stage,
// gated by candidate.advance).
export const candidateStageSchema = z.enum([
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]);

export const candidateResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  vacancyId: z.uuid(),
  name: z.object({ ar: z.string(), en: z.string() }),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  stage: candidateStageSchema,
  cvDocumentId: z.uuid().nullable(),
  notes: z.string().nullable(),
  createdByUserId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create: `vacancyId` is required (the service validates it and derives clientId);
// `stage` is never set on create — a candidate always starts `applied`.
export const createCandidateRequestSchema = z.object({
  vacancyId: z.uuid(),
  name: z.object({ ar: z.string().min(1).max(200), en: z.string().min(1).max(200) }),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  cvDocumentId: z.uuid().optional(),
  notes: z.string().max(4000).optional(),
});

// Update: editable core fields only — stage is advanced via candidate.advance.
export const updateCandidateRequestSchema = z.object({
  name: z.object({ ar: z.string().min(1).max(200), en: z.string().min(1).max(200) }).optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  cvDocumentId: z.uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

// Stage transition (candidate.advance): advance the pipeline stage, validated
// server-side against the workflow.
export const changeCandidateStageRequestSchema = z.object({
  stage: candidateStageSchema,
});

export const candidateListResponseSchema = z.object({
  candidates: z.array(candidateResponseSchema),
});

// List filter (staff): narrow by vacancy and/or stage.
export const candidateQuerySchema = z.object({
  vacancyId: z.uuid().optional(),
  stage: candidateStageSchema.optional(),
});

export type CandidateStage = z.infer<typeof candidateStageSchema>;
export type CandidateResponse = z.infer<typeof candidateResponseSchema>;
export type CreateCandidateRequest = z.infer<typeof createCandidateRequestSchema>;
export type UpdateCandidateRequest = z.infer<typeof updateCandidateRequestSchema>;
export type ChangeCandidateStageRequest = z.infer<typeof changeCandidateStageRequestSchema>;
export type CandidateListResponse = z.infer<typeof candidateListResponseSchema>;
export type CandidateQuery = z.infer<typeof candidateQuerySchema>;
