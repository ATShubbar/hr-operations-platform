import { z } from 'zod';

// Documents (DOC-02). Metadata contract for the presigned upload flow: the API
// issues a short-lived PUT URL and a pending metadata row; the client uploads
// bytes directly to the object store; a confirm call marks it available. The
// blob never flows through the API.

export const documentCategorySchema = z.enum([
  'iqama',
  'passport',
  'visa',
  'contract',
  'gosi',
  'national_id',
  'cv',
  'other',
]);
export const documentStatusSchema = z.enum(['pending', 'available', 'quarantined', 'deleted']);

export const documentResponseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  category: documentCategorySchema,
  title: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().nullable(),
  status: documentStatusSchema,
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  employeeId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDocumentRequestSchema = z.object({
  clientId: z.uuid(),
  category: documentCategorySchema,
  title: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  employeeId: z.uuid().optional(),
});

// Response to the upload-issue: the pending document + the presigned PUT the
// client must transfer the bytes to (sending the given Content-Type header).
export const uploadIssueResponseSchema = z.object({
  document: documentResponseSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresInSeconds: z.number(),
  }),
});

export type DocumentCategory = z.infer<typeof documentCategorySchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
export type UploadIssueResponse = z.infer<typeof uploadIssueResponseSchema>;
