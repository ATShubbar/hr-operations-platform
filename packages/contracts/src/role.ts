import { z } from 'zod';

// The built-in roles (DS-19) for the Roles and permissions screen — READ-ONLY.
// Each role's permission list is the API's own ROLE_PERMISSIONS (the bundles the
// role-matrix spec pins to architecture.md v1.7), plus how many ACTIVE accounts
// hold it. `permissions` at the top level is the whole catalog, in its order, so
// the screen can lay the matrix out without a second copy of it. Editing roles
// is a later feature (owner: editable roles come LAST, with safeguards).
export const roleIdSchema = z.enum([
  'administrator',
  'hr_officer',
  'gro_officer',
  'auditor',
  'client_manager',
  'employee',
]);
export const roleKindSchema = z.enum(['staff', 'client', 'employee']);

export const roleResponseSchema = z.object({
  id: roleIdSchema,
  kind: roleKindSchema,
  permissions: z.array(z.string()),
  accounts: z.number().int(),
});

export const roleListResponseSchema = z.object({
  permissions: z.array(z.string()),
  roles: z.array(roleResponseSchema),
});

export type RoleId = z.infer<typeof roleIdSchema>;
export type RoleKind = z.infer<typeof roleKindSchema>;
export type RoleResponse = z.infer<typeof roleResponseSchema>;
export type RoleListResponse = z.infer<typeof roleListResponseSchema>;
