import { z } from 'zod';

// Client portal users (CLIENT-03). A Client Admin manages the client_rep users
// of its own client company. Client users are auth_users (principal_type
// client_rep); this API never exposes password/mfa material.
export const clientUserRoleSchema = z.enum(['client_admin', 'client_user']);
export const clientUserStatusSchema = z.enum(['active', 'disabled']);

export const createClientUserRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  role: clientUserRoleSchema,
});

export const updateClientUserRequestSchema = z
  .object({
    role: clientUserRoleSchema.optional(),
    status: clientUserStatusSchema.optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: 'Provide at least one of role or status',
  });

export const clientUserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: clientUserRoleSchema,
  status: clientUserStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const clientUserListResponseSchema = z.object({
  users: z.array(clientUserResponseSchema),
});

export type ClientUserRole = z.infer<typeof clientUserRoleSchema>;
export type ClientUserStatus = z.infer<typeof clientUserStatusSchema>;
export type CreateClientUserRequest = z.infer<typeof createClientUserRequestSchema>;
export type UpdateClientUserRequest = z.infer<typeof updateClientUserRequestSchema>;
export type ClientUserResponse = z.infer<typeof clientUserResponseSchema>;
export type ClientUserListResponse = z.infer<typeof clientUserListResponseSchema>;
