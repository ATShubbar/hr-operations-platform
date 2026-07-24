import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  calendarRangeQuerySchema,
  createCalendarEventRequestSchema,
  updateCalendarEventRequestSchema,
  type CalendarEventListResponse,
  type CalendarEventResponse,
  type CalendarItem,
  type CalendarViewResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { CalendarEventModel as CalendarEventRecord } from '../../../generated/prisma/models';
import { PolicyService } from '../../auth/public-api';
import { TasksService } from '../../tasks/public-api';
import { RequestsService } from '../../requests/public-api';
import { GroProcessesService } from '../../gro/public-api';
import { CalendarService } from '../application/calendar.service';
import { deadlineItem, dueInRange, eventItem, isActiveDeadline } from '../domain/calendar-view';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Calendar API (CAL-02) — STAFF-ONLY. Events are own-scoped (owner = the creator);
// `calendar.read-all` lifts read/update/delete to any event. The calendar VIEW is
// the delivery-layer payoff: it merges own events with read-only ACTIVE deadlines
// from Tasks/Requests/GRO for a date range, each source gated by its read permission
// (all staff read tasks/requests; GRO only for gro.read holders).
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly policy: PolicyService,
    private readonly tasks: TasksService,
    private readonly requests: RequestsService,
    private readonly gro: GroProcessesService,
  ) {}

  // ---- own events ----

  @RequirePermission('calendar.create')
  @Post('events')
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<CalendarEventResponse> {
    const parsed = createCalendarEventRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid calendar event payload');
    const req = parsed.data;
    const row = await this.calendar.create({
      ownerUserId: this.actorId(),
      clientId: req.clientId ?? null,
      title: req.title,
      description: req.description ?? null,
      location: req.location ?? null,
      startAt: req.startAt,
      endAt: req.endAt,
      allDay: req.allDay,
    });
    return toResponse(row);
  }

  @RequirePermission('calendar.read')
  @Get('events')
  async list(@Query() query: unknown): Promise<CalendarEventListResponse> {
    const range = calendarRangeQuerySchema.safeParse(query);
    const { from, to } = range.success ? range.data : {};
    const rows = await this.calendar.list({
      ownerUserId: this.canAll() ? undefined : this.actorId(),
      from,
      to,
    });
    return { events: rows.map(toResponse) };
  }

  @RequirePermission('calendar.read')
  @Get('events/:id')
  async get(@Param('id') id: string): Promise<CalendarEventResponse> {
    return toResponse(await this.ownEvent(id));
  }

  @RequirePermission('calendar.update')
  @Patch('events/:id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<CalendarEventResponse> {
    await this.ownEvent(id); // own-or-read-all, else 404
    const parsed = updateCalendarEventRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid calendar event payload');
    const row = await this.calendar.update(id, parsed.data);
    if (!row) throw new NotFoundException('Calendar event not found');
    return toResponse(row);
  }

  @RequirePermission('calendar.delete')
  @Delete('events/:id')
  async remove(@Param('id') id: string): Promise<CalendarEventResponse> {
    await this.ownEvent(id); // own-or-read-all, else 404
    const row = await this.calendar.remove(id);
    if (!row) throw new NotFoundException('Calendar event not found');
    return toResponse(row);
  }

  // ---- aggregated view ----

  @RequirePermission('calendar.read')
  @Get('view')
  async view(@Query() query: unknown): Promise<CalendarViewResponse> {
    const parsed = calendarRangeQuerySchema.safeParse(query);
    if (!parsed.success || !parsed.data.from || !parsed.data.to) {
      throw new BadRequestException('from and to are required');
    }
    const { from, to } = parsed.data;
    const role = requestContext.get()?.role;
    const me = this.actorId();
    const items: CalendarItem[] = [];

    // own events (or all, read-all) that overlap the window
    const events = await this.calendar.list({ ownerUserId: this.canAll() ? undefined : me, from, to });
    for (const e of events) items.push(eventItem(e));

    // task deadlines — assigned/created by me, or all with task.read-all
    if (this.policy.can(role, 'task.read')) {
      const unrestricted = this.policy.can(role, 'task.read-all');
      const tasks = await this.tasks.list({ scopeUserId: unrestricted ? undefined : me });
      for (const t of tasks) {
        if (dueInRange(t.dueDate, from, to) && isActiveDeadline('task', t.status)) {
          items.push(deadlineItem('task', t.id, t.title, t.dueDate!, t.status, t.clientId));
        }
      }
    }

    // request deadlines — all staff read requests
    if (this.policy.can(role, 'request.read')) {
      const reqs = await this.requests.list();
      for (const r of reqs) {
        if (dueInRange(r.dueDate, from, to) && isActiveDeadline('request', r.status)) {
          items.push(deadlineItem('request', r.id, r.title, r.dueDate!, r.status, r.clientId));
        }
      }
    }

    // GRO deadlines — only for gro.read holders (Recruiter/Finance excluded)
    if (this.policy.can(role, 'gro.read')) {
      const procs = await this.gro.list();
      for (const p of procs) {
        if (dueInRange(p.dueDate, from, to) && isActiveDeadline('gro', p.status)) {
          items.push(deadlineItem('gro', p.id, p.type, p.dueDate!, p.status, p.clientId));
        }
      }
    }

    return { items };
  }

  // ---- helpers ----

  // The event by id, but only if the caller owns it or holds calendar.read-all.
  // Anything else is a 404 — never leak another owner's event.
  private async ownEvent(id: string): Promise<CalendarEventRecord> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Calendar event not found');
    const row = await this.calendar.getById(id);
    if (!row) throw new NotFoundException('Calendar event not found');
    if (row.ownerUserId !== this.actorId() && !this.canAll()) {
      throw new NotFoundException('Calendar event not found');
    }
    return row;
  }

  private actorId(): string {
    const id = requestContext.get()?.actorId;
    if (!id) throw new ForbiddenException('No authenticated actor');
    return id;
  }

  private canAll(): boolean {
    return this.policy.can(requestContext.get()?.role, 'calendar.read-all');
  }
}

function toResponse(e: CalendarEventRecord): CalendarEventResponse {
  return {
    id: e.id,
    ownerUserId: e.ownerUserId,
    clientId: e.clientId,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    allDay: e.allDay,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
