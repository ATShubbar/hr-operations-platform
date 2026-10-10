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
  z.object({ kind: z.literal('procedure'), id: z.uuid(), type: z.string(), employee: person }),
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
});

export const escalationLadderResponseSchema = z.object({
  today: z.string(), // the system timezone's date the ladder was worked out for
  thresholds: escalationThresholdsSchema,
  items: z.array(escalationItemSchema), // most urgent first
  // Expiries the viewer could read that are QUIET: a procedure renewing them is open.
  suppressed: z.number().int(),
});

export type EscalationItem = z.infer<typeof escalationItemSchema>;
export type EscalationSubject = z.infer<typeof escalationSubjectSchema>;
export type EscalationOwner = z.infer<typeof escalationOwnerSchema>;
export type EscalationLadderResponse = z.infer<typeof escalationLadderResponseSchema>;
