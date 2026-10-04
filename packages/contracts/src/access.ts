import { z } from 'zod';
import { roleIdSchema } from './role.js';

// What each role sees on an employee record (DS-21) — the Settings → Access
// table. READ-ONLY: the API computes it from the rules it enforces (the role
// bundles + the redaction tiers in employee-view.ts). Editing field access is a
// later feature (owner: editable roles / field access come LAST).
//
//   full        — every record the role can reach, in full
//   own_company — the caller's own company only (client managers)
//   own_record  — the caller's own record only (employees)
//   hidden      — the record is visible, this group is redacted
//   none        — no access to this at all
export const accessGroupSchema = z.enum([
  'profile',
  'expiries',
  'identifiers',
  'pay',
  'clients',
  'calendar',
]);
export const accessLevelSchema = z.enum(['full', 'own_company', 'own_record', 'hidden', 'none']);

export const accessResponseSchema = z.object({
  roles: z.array(roleIdSchema),
  rows: z.array(
    z.object({
      group: accessGroupSchema,
      access: z.record(roleIdSchema, accessLevelSchema),
    }),
  ),
});

export type AccessGroup = z.infer<typeof accessGroupSchema>;
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type AccessResponse = z.infer<typeof accessResponseSchema>;
