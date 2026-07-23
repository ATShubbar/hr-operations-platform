import { z } from 'zod';

// Document-expiry engine (EXP-02). The manual scan trigger (POST /expiry/scan)
// returns a run summary — no client data, just the counts of what the scan did.
export const expiryScanResponseSchema = z.object({
  scanned: z.number().int().nonnegative(), // documents within the scan horizon
  alertsRaised: z.number().int().nonnegative(), // (document, tier) claims newly created
  notificationsSent: z.number().int().nonnegative(), // per-recipient notifications
});

export type ExpiryScanResponse = z.infer<typeof expiryScanResponseSchema>;
