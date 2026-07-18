import { z } from 'zod';

export const bilingualTextSchema = z.object({
  ar: z.string().min(1),
  en: z.string().min(1),
});

export const clientCompanySchema = z.object({
  id: z.uuid(),
  name: bilingualTextSchema,
  status: z.enum(['active', 'inactive']),
});

export type BilingualText = z.infer<typeof bilingualTextSchema>;
export type ClientCompany = z.infer<typeof clientCompanySchema>;
