import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CalendarEventModel as CalendarEventRecord } from '../../../generated/prisma/models';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import type { CreateCalendarEventInput, UpdateCalendarEventInput } from '../domain/calendar-event';

// Calendar event registry access (CAL-01). STAFF-INTERNAL — no client path (clients
// have no calendar access). Every mutation writes its audit entry in the SAME
// transaction (AUDIT-03), scoped to the event's optional clientId context when set
// (it is context/reporting, not an ownership key). The snapshot is non-sensitive
// metadata (title/start/owner).
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateCalendarEventInput): Promise<CalendarEventRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarEvent.create({ data: toCreateData(input) });
      await this.audit.record(tx, {
        resource: 'calendar-event',
        action: 'create',
        clientId: row.clientId ?? undefined,
        after: snapshot(row),
      });
      return row;
    });
  }

  // List events, optionally scoped to an owner and/or overlapping a date range
  // (an event overlaps [from,to] when it starts before `to` and ends after `from`).
  list(filters?: { ownerUserId?: string; from?: Date; to?: Date }): Promise<CalendarEventRecord[]> {
    return this.prisma.calendarEvent.findMany({
      where: {
        ...(filters?.ownerUserId ? { ownerUserId: filters.ownerUserId } : {}),
        ...(filters?.to ? { startAt: { lte: filters.to } } : {}),
        ...(filters?.from ? { endAt: { gte: filters.from } } : {}),
      },
      orderBy: { startAt: 'asc' },
    });
  }

  getById(id: string): Promise<CalendarEventRecord | null> {
    return this.prisma.calendarEvent.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateCalendarEventInput): Promise<CalendarEventRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.calendarEvent.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.calendarEvent.update({ where: { id }, data: toUpdateData(data) });
      await this.audit.record(tx, {
        resource: 'calendar-event',
        action: 'update',
        clientId: row.clientId ?? undefined,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }

  async remove(id: string): Promise<CalendarEventRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.calendarEvent.findUnique({ where: { id } });
      if (!before) return null;
      const row = await tx.calendarEvent.delete({ where: { id } });
      await this.audit.record(tx, {
        resource: 'calendar-event',
        action: 'delete',
        clientId: before.clientId ?? undefined,
        before: snapshot(before),
      });
      return row;
    });
  }
}

function toCreateData(input: CreateCalendarEventInput): Prisma.CalendarEventUncheckedCreateInput {
  return {
    ownerUserId: input.ownerUserId,
    clientId: input.clientId ?? null,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
  };
}

function toUpdateData(data: UpdateCalendarEventInput): Prisma.CalendarEventUpdateInput {
  return {
    ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.startAt !== undefined ? { startAt: data.startAt } : {}),
    ...(data.endAt !== undefined ? { endAt: data.endAt } : {}),
    ...(data.allDay !== undefined ? { allDay: data.allDay } : {}),
  };
}

function snapshot(e: CalendarEventRecord): Prisma.InputJsonValue {
  return {
    title: e.title,
    startAt: e.startAt.toISOString(),
    ownerUserId: e.ownerUserId,
  };
}
