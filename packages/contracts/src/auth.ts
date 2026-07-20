import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  userId: z.uuid(),
  principalType: z.enum(['staff', 'client_rep']),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
