import { z } from 'zod';

// Staff users (UX-10b). Consultancy staff accounts — the matrix row
// "System config & staff users": System Admin CRUD, Company Admin R.
//
// TWO RESPONSE SHAPES ON PURPOSE, and the difference is the whole point of the
// permission split:
//
//   StaffUserResponse   — the MANAGEMENT view. Email, status, role, timestamps,
//                         whether MFA is enrolled. Admin-only.
//   StaffDirectoryEntry — the NAME-RESOLUTION view. id + displayName + role and
//                         nothing else, so every staff role can turn an
//                         assignee id into a person without being handed an
//                         account roster.
//
// If a future field belongs on the management view, it must NOT be added to the
// directory entry out of convenience — that is how a narrow capability quietly
// becomes a broad one.

export const staffUserStatusSchema = z.enum(['active', 'disabled']);

// The seven staff roles from the frozen matrix. Client roles are managed
// through client-user.* and are not addressable here.
export const staffUserRoleSchema = z.enum([
  'system_admin',
  'company_admin',
  'recruiter',
  'hr_officer',
  'gro_officer',
  'finance',
  'read_only',
]);

export const createStaffUserRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  role: staffUserRoleSchema,
  displayName: z.string().min(1).max(120).optional(),
});

export const updateStaffUserRequestSchema = z
  .object({
    role: staffUserRoleSchema.optional(),
    status: staffUserStatusSchema.optional(),
    displayName: z.string().min(1).max(120).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined || v.displayName !== undefined, {
    message: 'Provide at least one of role, status or displayName',
  });

export const staffUserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  role: staffUserRoleSchema,
  status: staffUserStatusSchema,
  // Whether the account has enrolled MFA — never the secret itself.
  mfaEnrolled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const staffUserListResponseSchema = z.object({
  users: z.array(staffUserResponseSchema),
});

// The narrow view. Deliberately NOT an extension of the management schema.
export const staffDirectoryEntrySchema = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  role: staffUserRoleSchema,
});

export const staffDirectoryResponseSchema = z.object({
  users: z.array(staffDirectoryEntrySchema),
});

export type StaffUserStatus = z.infer<typeof staffUserStatusSchema>;
export type StaffUserRole = z.infer<typeof staffUserRoleSchema>;
export type CreateStaffUserRequest = z.infer<typeof createStaffUserRequestSchema>;
export type UpdateStaffUserRequest = z.infer<typeof updateStaffUserRequestSchema>;
export type StaffUserResponse = z.infer<typeof staffUserResponseSchema>;
export type StaffUserListResponse = z.infer<typeof staffUserListResponseSchema>;
export type StaffDirectoryEntry = z.infer<typeof staffDirectoryEntrySchema>;
export type StaffDirectoryResponse = z.infer<typeof staffDirectoryResponseSchema>;
