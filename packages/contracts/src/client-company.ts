import { z } from 'zod';

export const bilingualTextSchema = z.object({
  ar: z.string().min(1),
  en: z.string().min(1),
});

export const clientStatusSchema = z.enum(['active', 'inactive']);

export const clientCompanySchema = z.object({
  id: z.uuid(),
  name: bilingualTextSchema,
  status: clientStatusSchema,
});

// Client management API (CLIENT-02).
export const createClientRequestSchema = z.object({
  name: bilingualTextSchema,
  status: clientStatusSchema.optional(),
});

export const updateClientRequestSchema = z
  .object({
    name: bilingualTextSchema.optional(),
    status: clientStatusSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.status !== undefined, {
    message: 'Provide at least one of name or status',
  });

export const clientResponseSchema = clientCompanySchema.extend({
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(),
});

export const clientListResponseSchema = z.object({
  clients: z.array(clientResponseSchema),
});

export type BilingualText = z.infer<typeof bilingualTextSchema>;
export type ClientStatus = z.infer<typeof clientStatusSchema>;
export type ClientCompany = z.infer<typeof clientCompanySchema>;
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;
export type ClientResponse = z.infer<typeof clientResponseSchema>;
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
