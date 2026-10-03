import { z } from 'zod';

// Client portal users (CLIENT-03; ROLE-02/03). Administrators manage the
// client_rep users of any client over /clients/:clientId/users. Since ADR-013
// there is ONE client role, Client manager, so a role is never chosen — it is
// still carried on the response for symmetry with staff accounts. Client users
// are auth_users (principal_type client_rep); this API never exposes
// password/mfa material.
export const clientUserRoleSchema = z.enum(['client_manager']);
export const clientUserStatusSchema = z.enum(['active', 'disabled']);

export const createClientUserRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

// Status is the only thing to change: with one client role there is no role
// to move between (ADR-013).
export const updateClientUserRequestSchema = z
  .object({
    status: clientUserStatusSchema,
  })
  .strict();

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
