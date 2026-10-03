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
    ])
    .nullable(),
});

export const employeeHistoryResponseSchema = z.object({
  entries: z.array(employeeHistoryEntrySchema),
  /** True when older entries exist beyond the returned page. */
  truncated: z.boolean(),
});

export type HistoryResource = z.infer<typeof historyResourceSchema>;
export type EmployeeHistoryEntry = z.infer<typeof employeeHistoryEntrySchema>;
export type EmployeeHistoryResponse = z.infer<typeof employeeHistoryResponseSchema>;
