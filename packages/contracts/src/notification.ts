import { z } from 'zod';
import { bilingualTextSchema } from './client-company.js';

// Notifications (NOTIF-02). In-app notifications are per-user (recipient-owned);
// title/body are stored bilingual (ar/en) so the reader sees their language.
// Email delivery (the same content) lands in NOTIF-03.

export const notificationCategorySchema = z.enum([
  'document_expiry',
  'task',
  'request',
  'general',
  'system',
]);

export const notificationResponseSchema = z.object({
  id: z.uuid(),
  category: notificationCategorySchema,
  title: bilingualTextSchema,
  body: bilingualTextSchema,
  data: z.unknown().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationResponseSchema),
  unreadCount: z.number(),
});

// Per-user notification preferences (NOTIF-04). The effective per-category
// EMAIL flags for the caller (defaults on, overlaid with their overrides);
// in-app delivery is always on and not represented here.
export const notificationPreferencesResponseSchema = z.object({
  email: z.record(notificationCategorySchema, z.boolean()),
});

// Set one category's email preference (per-category PATCH).
export const setNotificationPreferenceRequestSchema = z.object({
  emailEnabled: z.boolean(),
});

export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type NotificationPreferencesResponse = z.infer<
  typeof notificationPreferencesResponseSchema
>;
export type SetNotificationPreferenceRequest = z.infer<
  typeof setNotificationPreferenceRequestSchema
>;
