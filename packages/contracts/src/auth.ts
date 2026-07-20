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

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>;
export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;
