import { z } from 'zod';

// The request thread (ADR-016). THREAD-01: comments.
export const createRequestCommentSchema = z
  .object({ body: z.string().trim().min(1).max(4000) })
  .strict();

export const requestCommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  // Who wrote it — a name and a kind, never an email (the DS-08 rule).
  author: z.object({ name: z.string().nullable(), kind: z.enum(['staff', 'client', 'employee']) }).nullable(),
  // The caller wrote it.
  mine: z.boolean(),
  createdAt: z.string(),
});

export const requestCommentListResponseSchema = z.object({ comments: z.array(requestCommentSchema) });

export type CreateRequestComment = z.infer<typeof createRequestCommentSchema>;
export type RequestComment = z.infer<typeof requestCommentSchema>;
export type RequestCommentListResponse = z.infer<typeof requestCommentListResponseSchema>;

// THREAD-02: attachments. PDF, JPG or PNG, up to 10 MB, at most 20 per request.
export const REQUEST_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const REQUEST_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const REQUEST_ATTACHMENT_MAX_FILES = 20;

export const createRequestAttachmentSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(REQUEST_ATTACHMENT_TYPES),
    sizeBytes: z.number().int().min(1).max(REQUEST_ATTACHMENT_MAX_BYTES),
  })
  .strict();

// What the thread shows. A removed file keeps its row ("removed by …") but
// loses its name, size and download; a file still being checked, or one the
// check refused, is shown only to the person who uploaded it.
export const requestAttachmentSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'available', 'quarantined', 'rejected', 'removed']),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  uploadedBy: z.object({ name: z.string().nullable(), kind: z.enum(['staff', 'client', 'employee']) }).nullable(),
  mine: z.boolean(),
  createdAt: z.string(),
  removedAt: z.string().nullable(),
});

export const requestAttachmentListResponseSchema = z.object({
  attachments: z.array(requestAttachmentSchema),
});

export const requestAttachmentUploadResponseSchema = z.object({
  attachment: requestAttachmentSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresInSeconds: z.number(),
  }),
});

export type CreateRequestAttachment = z.infer<typeof createRequestAttachmentSchema>;
export type RequestAttachment = z.infer<typeof requestAttachmentSchema>;
export type RequestAttachmentListResponse = z.infer<typeof requestAttachmentListResponseSchema>;
export type RequestAttachmentUploadResponse = z.infer<typeof requestAttachmentUploadResponseSchema>;
