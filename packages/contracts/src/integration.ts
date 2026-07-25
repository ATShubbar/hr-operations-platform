import { z } from 'zod';

// Google Calendar invitations (GCAL-02; ADR-009). The request is the WHITELISTED
// typed input — there is no free-form payload and no field for a government
// identifier or salary; the adapter builds the outbound title/description from these
// structured parts. Create and update take the full invitation (the adapter rebuilds
// the payload). Timestamps are ISO strings, storage UTC.
export const gcalInvitationKindSchema = z.enum(['interview', 'meeting']);
export const gcalInvitationStatusSchema = z.enum(['scheduled', 'cancelled']);

export const createGcalInvitationRequestSchema = z
  .object({
    kind: gcalInvitationKindSchema,
    start: z.coerce.date(),
    end: z.coerce.date(),
    timezone: z.string().min(1).max(64),
    // structured summary parts (interview → name/role; meeting → subject)
    personName: z.string().max(200).optional(),
    jobTitle: z.string().max(200).optional(),
    meetingTitle: z.string().max(200).optional(),
    referenceCode: z.string().min(1).max(64),
    location: z.string().max(200).optional(),
    meetingLink: z.string().url().max(500).optional(),
    attendeeEmails: z.array(z.string().email()).min(1).max(50),
  })
  .refine((v) => v.end >= v.start, { message: 'end must be on or after start' });

// The whitelisted payload that leaves the system — surfaced in the response so a
// dev/inspection surface can show EXACTLY what was sent (ADR-009 transparency).
export const gcalEventPayloadSchema = z.object({
  summary: z.string(),
  description: z.string(),
  start: z.object({ dateTime: z.string(), timeZone: z.string() }),
  end: z.object({ dateTime: z.string(), timeZone: z.string() }),
  location: z.string().optional(),
  attendees: z.array(z.object({ email: z.string() })),
});

export const gcalInvitationResponseSchema = z.object({
  id: z.uuid(),
  externalEventId: z.string(),
  referenceCode: z.string(),
  kind: gcalInvitationKindSchema,
  status: gcalInvitationStatusSchema,
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string(),
  payload: gcalEventPayloadSchema,
  createdByUserId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const gcalInvitationListResponseSchema = z.object({
  invitations: z.array(gcalInvitationResponseSchema),
});

export type GcalInvitationKind = z.infer<typeof gcalInvitationKindSchema>;
export type GcalInvitationStatus = z.infer<typeof gcalInvitationStatusSchema>;
export type CreateGcalInvitationRequest = z.infer<typeof createGcalInvitationRequestSchema>;
export type GcalEventPayload = z.infer<typeof gcalEventPayloadSchema>;
export type GcalInvitationResponse = z.infer<typeof gcalInvitationResponseSchema>;
export type GcalInvitationListResponse = z.infer<typeof gcalInvitationListResponseSchema>;
