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
