import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { CalendarService } from '../src/modules/calendar/public-api';

// CAL-01: the calendar event foundation. No HTTP surface yet (CAL-02). Exercises
// CalendarService directly and proves: create + audits; update audits; list filters
// by owner and by date-range overlap; remove.

describe('Calendar — CalendarService (CAL-01)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let calendar: CalendarService;
  const ownerA = 'c1c1c1c1-0000-4000-8000-000000000001';
  const ownerB = 'c1c1c1c1-0000-4000-8000-000000000002';
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    calendar = app.get(CalendarService);
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { resource: 'calendar-event' } });
    await owner.calendarEvent.deleteMany({ where: { id: { in: createdIds } } });
    await owner.$disconnect();
    await app.close();
  });

  const mk = (ownerUserId: string, title: string, start: string, end: string) =>
    calendar.create({
      ownerUserId,
      title,
      startAt: new Date(start),
      endAt: new Date(end),
    });

  it('creates an event and audits it in the same transaction', async () => {
    const row = await mk(ownerA, 'Kickoff', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z');
    createdIds.push(row.id);
    expect(row.ownerUserId).toBe(ownerA);
    expect(row.allDay).toBe(false); // default

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'calendar-event', action: 'create' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('lists events filtered by owner', async () => {
    const b = await mk(ownerB, 'Other-owner event', '2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z');
    createdIds.push(b.id);
    const mine = await calendar.list({ ownerUserId: ownerA });
    expect(mine.every((e) => e.ownerUserId === ownerA)).toBe(true);
    expect(mine.some((e) => e.id === b.id)).toBe(false);
  });

  it('lists events overlapping a date range', async () => {
    const inRange = await mk(ownerA, 'In range', '2026-10-10T09:00:00Z', '2026-10-10T10:00:00Z');
    const outRange = await mk(ownerA, 'Out of range', '2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z');
    createdIds.push(inRange.id, outRange.id);

    const rows = await calendar.list({
      ownerUserId: ownerA,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
    });
    const ids = rows.map((e) => e.id);
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(outRange.id);
  });

  it('updates an event and audits the before/after', async () => {
    const row = await mk(ownerA, 'Draft title', '2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z');
    createdIds.push(row.id);
    const updated = await calendar.update(row.id, { title: 'Final title', location: 'Room 5' });
    expect(updated?.title).toBe('Final title');
    expect(updated?.location).toBe('Room 5');

    const entries = await owner.auditEntry.findMany({
      where: { resource: 'calendar-event', action: 'update' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('removes an event; a missing id returns null', async () => {
    const row = await mk(ownerA, 'To delete', '2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z');
    const removed = await calendar.remove(row.id);
    expect(removed?.id).toBe(row.id);
    expect(await calendar.getById(row.id)).toBeNull();
    expect(await calendar.remove('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
