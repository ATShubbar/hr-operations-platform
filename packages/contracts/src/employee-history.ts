import { z } from 'zod';

// A person's history (AUDIT-06): what happened on their record, their documents
// and their GRO processes — newest first. Built from the audit trail, but it is
// NOT the audit log: no before/after snapshots, no request ids, no client ids.
// Only what happened, to which of their records, by whom (name + role), when.
// That is what makes it readable by everyone who can read the record
// (`employee.history`), while the full log stays Administrator + Auditor.

// DS-08 adds 'request': a request's own decision trail uses the same curated
// shape (GET /requests/:id/history).
export const historyResourceSchema = z.enum([
  'employee',
  'employee-user',
  'document',
  'gro-process',
  'request',
  // DEP-03 (ADR-017): a dependant's changes, keyed to the sponsor.
  'dependant',
  // MOB-03 (ADR-018): onboarding / final-exit sequence changes, keyed to the employee.
  'gro-sequence',
]);

export const employeeHistoryEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  resource: historyResourceSchema,
  action: z.string(),
  actor: z
    .object({
      name: z.string().nullable(),
      role: z.string().nullable(),
    })
    .nullable(),
  // Names the record an entry is about, where that is not the person themselves.
  subject: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('document'), title: z.string(), category: z.string() }),
      z.object({ kind: z.literal('gro-process'), type: z.string() }),
      // The dependant by name and relationship — never their iqama number.
      z.object({ kind: z.literal('dependant'), name: z.string(), relationship: z.string() }),
      // Which sequence, and — for a step filed or reopened — which step (a key the web translates).
      z.object({
        kind: z.literal('gro-sequence'),
        sequence: z.string(),
        step: z.string().nullable(),
      }),
    ])
    .nullable(),
});

export const employeeHistoryResponseSchema = z.object({
  entries: z.array(employeeHistoryEntrySchema),
  /** True when older entries exist beyond the returned page. */
  truncated: z.boolean(),
});

// HIST-01 (ADR-022): a PERSON's history also says what changed. `before` and
// `after` hold the changed fields the READER may see (the same keys and raw
// values the audit trail records); `withheld` names the kinds of detail that
// changed and were left out for this reader — pay without `salary.read`, ID
// fields without `govdata.read`, an account's details without
// `employee-user.read`. A request's decision trail keeps the plain entry above.
export const historyWithheldSchema = z.enum(['pay', 'ids', 'account', 'record']);
const historySideSchema = z.record(z.string(), z.unknown()).nullable();
export const personHistoryEntrySchema = employeeHistoryEntrySchema.extend({
  before: historySideSchema,
  after: historySideSchema,
  withheld: z.array(historyWithheldSchema),
});
export const personHistoryResponseSchema = z.object({
  entries: z.array(personHistoryEntrySchema),
  truncated: z.boolean(),
});

export type HistoryResource = z.infer<typeof historyResourceSchema>;
export type HistoryWithheld = z.infer<typeof historyWithheldSchema>;
export type PersonHistoryEntry = z.infer<typeof personHistoryEntrySchema>;
export type PersonHistoryResponse = z.infer<typeof personHistoryResponseSchema>;
export type EmployeeHistoryEntry = z.infer<typeof employeeHistoryEntrySchema>;
export type EmployeeHistoryResponse = z.infer<typeof employeeHistoryResponseSchema>;
