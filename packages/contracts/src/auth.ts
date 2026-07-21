import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  userId: z.uuid(),
  principalType: z.enum(['staff', 'client_rep']),
  // Set when the login produced a LIMITED session instead of a full one:
  mfaRequired: z.boolean().optional(), // enrolled user must pass /auth/mfa/challenge
  mfaEnrollRequired: z.boolean().optional(), // admin roles must enroll first
});

export const mfaEnrollResponseSchema = z.object({
  otpauthUri: z.string().startsWith('otpauth://'),
});

export const mfaCodeRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

// Current authenticated actor (AUTH-08, GET /auth/me). `permissions` is the
// actor's capability list — the UI shows/hides actions from it.
export const meResponseSchema = z.object({
  userId: z.uuid(),
  principalType: z.enum(['staff', 'client_rep']),
  role: z.string(),
  clientId: z.uuid().nullable(),
  permissions: z.array(z.string()),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>;
export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;
