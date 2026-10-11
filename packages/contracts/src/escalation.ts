import { z } from 'zod';
import {
  DEPENDANT_DOCS,
  EMPLOYEE_DOCS,
  ESCALATION_RULES,
  ESCALATION_STAGES,
  THRESHOLD_DAYS,
  thresholdOrderProblem,
} from './escalation-rules.js';

// The escalation ladder (ADR-021) — the notification centre. Derived per
// viewer at the moment of asking; nothing here is stored.

export const escalationRuleSchema = z.enum(ESCALATION_RULES);
export const escalationStageSchema = z.enum(ESCALATION_STAGES);

// The thresholds SETTING (`escalation.thresholds`, system level). Strict and
// complete: every rule and stage is present, each value from the fixed list,
// and within a rule a later stage does not start earlier than the one before.
const thresholdDay = z
  .number()
  .int()
  .refine(
    (n) => (THRESHOLD_DAYS as readonly number[]).includes(n),
    'Not an allowed number of days',
  );
export const escalationThresholdsSchema = z
  .strictObject({
    expiry: z.strictObject({
      notice: thresholdDay,
      reminder: thresholdDay,
      escalation: thresholdDay,
    }),
    queue: z.strictObject({
      notice: thresholdDay,
      reminder: thresholdDay,
      escalation: thresholdDay,
    }),
    sla: z.strictObject({ reminder: thresholdDay, escalation: thresholdDay }),
  })
  .refine(
    (t) => thresholdOrderProblem(t) === null,
    'A later stage starts earlier than the one before',
  );

const bilingual = z.object({ ar: z.string(), en: z.string() });
const person = z.object({ id: z.uuid(), name: bilingual });

// What an item is ABOUT. Keys and types travel as stable values; the web
// translates them.
export const escalationSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document'), doc: z.enum(EMPLOYEE_DOCS), employee: person }),
  z.object({
    kind: z.literal('dependant_document'),
    doc: z.enum(DEPENDANT_DOCS),
    dependant: z.object({
      id: z.uuid(),
      name: z.object({ ar: z.string().nullable(), en: z.string() }),
    }),
    employee: person,
  }),
  z.object({
    kind: z.literal('procedure'),
    id: z.uuid(),
    type: z.string(),
    employee: person,
    // DEP-07: the dependant a dependant procedure is for; null for any other.
    dependant: z
      .object({ name: z.object({ ar: z.string().nullable(), en: z.string() }) })
      .nullable(),
  }),
  // MOB-06a: a ready step of a running onboarding / final exit (the queue rule).
  z.object({
    kind: z.literal('sequence_step'),
    sequenceId: z.uuid(),
    sequenceKind: z.enum(['onboarding', 'final_exit']),
    step: z.string(),
    employee: person,
  }),
  z.object({ kind: z.literal('task'), id: z.uuid(), title: z.string() }),
  z.object({ kind: z.literal('request'), id: z.uuid(), type: z.string(), title: z.string() }),
]);

// Who the item belongs to: a named person (a client's named officer, an
// assignee), or — for an expiry at a client with no named officer — a role.
export const escalationOwnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), name: z.string().nullable() }),
  z.object({ kind: z.literal('role'), role: z.enum(['gro_officer', 'hr_officer']) }),
]);

export const escalationItemSchema = z.object({
  // Stable for as long as the obligation exists: `expiry:<employee>:<doc>`,
  // `dependant:<dependant>:<doc>`, `procedure:<id>`, `task:<id>`, `request:<id>`.
  key: z.string(),
  rule: escalationRuleSchema,
  stage: escalationStageSchema,
  dueOn: z.string(), // YYYY-MM-DD
  daysLeft: z.number().int(), // negative = the date has passed
  subject: escalationSubjectSchema,
  client: z.object({ id: z.uuid(), name: bilingual }).nullable(),
  owner: escalationOwnerSchema.nullable(),
  mine: z.boolean(), // the viewer owns it — "Assigned to me"
  told: z.boolean(), // the viewer is in this stage's audience
  // NC-02: the viewer has marked it read AT THIS STAGE AND DATE. Climbing a
  // stage, or a changed date, makes it unread again.
  read: z.boolean(),
});

export const escalationLadderResponseSchema = z.object({
  today: z.string(), // the system timezone's date the ladder was worked out for
  thresholds: escalationThresholdsSchema,
  items: z.array(escalationItemSchema), // most urgent first
  // Expiries the viewer could read that are QUIET: a procedure renewing them is open.
  suppressed: z.number().int(),
});

// Read marks (NC-02) — the only thing the ladder stores. The caller names the
// items; the server marks those it is CURRENTLY showing them, at the stage and
// date they are at now, and ignores the rest.
export const MAX_READ_KEYS = 200;
export const markEscalationsReadRequestSchema = z.strictObject({
  keys: z.array(z.string().trim().min(1).max(200)).max(MAX_READ_KEYS),
});
export const markEscalationsReadResponseSchema = z.object({ marked: z.number().int() });

// The bell's count: unread items the viewer is told about, at Escalated or Breach.
export const escalationCountResponseSchema = z.object({ needsAction: z.number().int() });

export type MarkEscalationsReadRequest = z.infer<typeof markEscalationsReadRequestSchema>;
export type MarkEscalationsReadResponse = z.infer<typeof markEscalationsReadResponseSchema>;
export type EscalationCountResponse = z.infer<typeof escalationCountResponseSchema>;
export type EscalationItem = z.infer<typeof escalationItemSchema>;
export type EscalationSubject = z.infer<typeof escalationSubjectSchema>;
export type EscalationOwner = z.infer<typeof escalationOwnerSchema>;
export type EscalationLadderResponse = z.infer<typeof escalationLadderResponseSchema>;
