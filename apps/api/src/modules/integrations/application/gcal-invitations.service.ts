import { Injectable } from '@nestjs/common';
import type { CreateGcalInvitationRequest } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import type { GcalInvitationModel as GcalInvitationRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CalendarInvitation } from '../domain/calendar-invitation';
import { GoogleCalendarAdapter } from './google-calendar.adapter';

// Google Calendar invitations (GCAL-02). Orchestrates the adapter (the only path to
// Google) with persistence + audit: SEND to Google first (get the external id + the
// whitelisted payload), then persist the platform-side record (external id, reference
// code, and EXACTLY the payload that left) and audit — all staff-internal. The stored
// payload is the adapter's, never rebuilt here, so the service can't widen what leaves.
@Injectable()
export class GcalInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: GoogleCalendarAdapter,
    private readonly audit: AuditService,
  ) {}

  async create(
    input: CreateGcalInvitationRequest,
    createdByUserId: string | null,
  ): Promise<GcalInvitationRecord> {
    const { externalEventId, payload } = await this.adapter.createInvitation(toInvitation(input));
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.gcalInvitation.create({
        data: {
          externalEventId,
          referenceCode: input.referenceCode,
          kind: input.kind,
          startAt: input.start,
          endAt: input.end,
          timezone: input.timezone,
          payload: payload as unknown as Prisma.InputJsonValue,
          createdByUserId,
        },
      });
      await this.audit.record(tx, {
        resource: 'gcal-invitation',
        action: 'create',
        after: snapshot(row),
      });
      return row;
    });
  }

  list(): Promise<GcalInvitationRecord[]> {
    return this.prisma.gcalInvitation.findMany({ orderBy: { createdAt: 'desc' } });
  }

  getById(id: string): Promise<GcalInvitationRecord | null> {
    return this.prisma.gcalInvitation.findUnique({ where: { id } });
  }

  // Re-send the (rebuilt) invitation to Google and update the stored record.
  async update(id: string, input: CreateGcalInvitationRequest): Promise<GcalInvitationRecord | null> {
    const before = await this.prisma.gcalInvitation.findUnique({ where: { id } });
    if (!before) return null;
    const payload = await this.adapter.updateInvitation(before.externalEventId, toInvitation(input));
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.gcalInvitation.update({
        where: { id },
        data: {
          kind: input.kind,
          referenceCode: input.referenceCode,
          startAt: input.start,
          endAt: input.end,
          timezone: input.timezone,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(tx, {
        resource: 'gcal-invitation',
        action: 'update',
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  // Cancel the Google event and mark the record cancelled (kept for audit).
  async cancel(id: string): Promise<GcalInvitationRecord | null> {
    const before = await this.prisma.gcalInvitation.findUnique({ where: { id } });
    if (!before) return null;
    await this.adapter.cancelInvitation(before.externalEventId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.gcalInvitation.update({ where: { id }, data: { status: 'cancelled' } });
      await this.audit.record(tx, {
        resource: 'gcal-invitation',
        action: 'cancel',
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }
}

function toInvitation(input: CreateGcalInvitationRequest): CalendarInvitation {
  return {
    kind: input.kind,
    start: input.start,
    end: input.end,
    timezone: input.timezone,
    personName: input.personName ?? null,
    jobTitle: input.jobTitle ?? null,
    meetingTitle: input.meetingTitle ?? null,
    referenceCode: input.referenceCode,
    location: input.location ?? null,
    meetingLink: input.meetingLink ?? null,
    attendeeEmails: input.attendeeEmails,
  };
}

function snapshot(r: GcalInvitationRecord): Prisma.InputJsonValue {
  return {
    externalEventId: r.externalEventId,
    referenceCode: r.referenceCode,
    kind: r.kind,
    status: r.status,
  };
}
