import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  userId: z.uuid(),
  principalType: z.enum(['staff', 'client_rep', 'employee']),
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
  // The person's name, when they have one (UX-10b). Nullable because identity
  // has always been the email — "Today" greets only when this is present rather
  // than inventing a name from an email local-part.
  displayName: z.string().nullable(),
  principalType: z.enum(['staff', 'client_rep', 'employee']),
  role: z.string(),
  clientId: z.uuid().nullable(),
  // The employee record an `employee` principal is (ADR-011, SS-01); null for
  // staff and client reps.
  employeeId: z.uuid().nullable(),
  permissions: z.array(z.string()),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>;
export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;

// SS-06a: set a password from a one-time emailed link — an invitation (first
// password) or a reset. The token is the raw value from the link; the server
// keeps only its hash. 10+ characters: a self-chosen password for a large,
// non-technical population, with no admin to set it for them.
export const setPasswordRequestSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z.string().min(10).max(200),
  })
  .strict();

export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

