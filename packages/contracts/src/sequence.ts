import { z } from 'zod';

// Onboarding and final-exit sequences (MOB-02, ADR-018). Staff only.
//
// Steps travel as KEYS (`block-visa`, `exit-visa`…): the web app translates them,
// so the Arabic screen never shows the English text the step list is written in.
// `waitingOn` is keys too. The fee is the STANDARD government fee in SAR, shown for
// information (recording what was paid is Billing's — ADR-018). Responses are
// exact whitelists: a field added server-side does not reach the screen by default.

export const sequenceKindSchema = z.enum(['onboarding', 'final_exit']);
export const sequenceStatusSchema = z.enum(['running', 'completed', 'cancelled']);
export const sequenceStepStateSchema = z.enum(['filed', 'ready', 'blocked']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const startSequenceSchema = z.strictObject({ kind: sequenceKindSchema });

export const fileSequenceStepSchema = z.strictObject({
  filedOn: z
    .string()
    .regex(DATE_RE, 'Expected YYYY-MM-DD')
    .refine((s) => {
      const d = new Date(`${s}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'Not a real date')
    .optional(),
});

const person = z.strictObject({ name: z.string().nullable() });

export const sequenceStepSchema = z.strictObject({
  key: z.string(),
  portal: z.string(),
  fee: z.number(),
  day: z.number(),
  target: z.string(),
  state: sequenceStepStateSchema,
  waitingOn: z.array(z.string()),
  filedOn: z.string().nullable(),
  filedBy: person.nullable(),
});

export const sequenceResponseSchema = z.strictObject({
  id: z.uuid(),
  employeeId: z.uuid(),
  kind: sequenceKindSchema,
  status: sequenceStatusSchema,
  startedOn: z.string(),
  startedBy: person.nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  steps: z.array(sequenceStepSchema),
});

export const sequenceListResponseSchema = z.object({ sequences: z.array(sequenceResponseSchema) });

export type SequenceKind = z.infer<typeof sequenceKindSchema>;
export type SequenceStatus = z.infer<typeof sequenceStatusSchema>;
export type SequenceStepState = z.infer<typeof sequenceStepStateSchema>;
export type SequenceStep = z.infer<typeof sequenceStepSchema>;
export type SequenceResponse = z.infer<typeof sequenceResponseSchema>;
export type SequenceListResponse = z.infer<typeof sequenceListResponseSchema>;
