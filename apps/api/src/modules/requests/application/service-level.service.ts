import { Injectable, Logger } from '@nestjs/common';
import { addWorkingDays, dayIn, workingDaysBetween } from '@hr/dates';
import type { RequestType } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { ConfigService, SERVICE_LEVEL_KEY, serviceLevelDaysSchema } from '../../configuration/public-api';

type Tx = Prisma.TransactionClient;
type Days = Record<RequestType, number>;

const FALLBACK_DAYS: Days = { letter: 2, certificate: 2, document: 3, gro_service: 5, general: 1 };
const FALLBACK_WEEK = [0, 1, 2, 3, 4];

// A request's service level (THREAD-04, ADR-016): a turnaround per TYPE in
// WORKING days of the company's own week (`working.week`, client → system), the
// days themselves an Administrator setting (`request.service-level-days`). It
// sets a new request's due date (unless one was given), and it pauses while the
// request waits on its requester: on the way out of `info_needed` the due date
// moves later by the working days the wait lasted. Calendar days are taken in
// the system `timezone` (Asia/Riyadh). Public holidays are not modelled yet.
@Injectable()
export class ServiceLevelService {
  private readonly logger = new Logger(ServiceLevelService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The current turnaround per type (the setting; its catalog default when unset). */
  async days(): Promise<Days> {
    const parsed = serviceLevelDaysSchema.safeParse(await this.config.get(SERVICE_LEVEL_KEY));
    return parsed.success ? parsed.data : FALLBACK_DAYS;
  }

  /** The due date of a request of `type` raised now at `clientId`. */
  async dueFor(type: RequestType, clientId: string, at = new Date()): Promise<Date> {
    const [days, week, tz] = await Promise.all([this.days(), this.weekFor(clientId), this.timezone()]);
    return addWorkingDays(dayIn(at, tz), days[type], week);
  }

  /**
   * The due date after a wait that began at `since` and ends now — null when
   * there is no due date or the wait spans no working day. Used inside the
   * transaction that ends the wait (staff) or right after it (a reply).
   */
  async dueAfterPause(
    clientId: string,
    dueDate: Date | null,
    since: Date | null,
    endedAt = new Date(),
  ): Promise<{ dueDate: Date; pausedWorkingDays: number } | null> {
    if (!dueDate || !since) return null;
    const [week, tz] = await Promise.all([this.weekFor(clientId), this.timezone()]);
    const paused = workingDaysBetween(dayIn(since, tz), dayIn(endedAt, tz), week);
    if (paused === 0) return null;
    return { dueDate: addWorkingDays(dueDate, paused, week), pausedWorkingDays: paused };
  }

  /** Audit one pause in `tx` (the extension itself is written by the caller). */
  async recordPause(
    tx: Tx,
    request: { id: string; clientId: string },
    before: Date,
    after: { dueDate: Date; pausedWorkingDays: number },
  ): Promise<void> {
    await this.audit.record(tx, {
      resource: 'request',
      resourceId: request.id,
      action: 'service-level-paused',
      clientId: request.clientId,
      before: { dueDate: isoDay(before) },
      after: { dueDate: isoDay(after.dueDate), pausedWorkingDays: after.pausedWorkingDays },
    });
  }

  /**
   * After a requester's reply returned a waiting request (THREAD-03), extend its
   * due date — a SYSTEM consequence written on the staff connection, so neither
   * the client nor the employee role ever writes a due date. Conditional on the
   * due date still being the one the wait started with; a failure is logged,
   * not raised (the reply itself has already been accepted).
   */
  async extendAfterReturn(
    request: { id: string; clientId: string },
    waited: { dueDate: Date | null; since: Date | null },
  ): Promise<void> {
    try {
      const next = await this.dueAfterPause(request.clientId, waited.dueDate, waited.since);
      if (!next || !waited.dueDate) return;
      await this.prisma.$transaction(async (tx) => {
        const moved = await tx.request.updateMany({
          where: { id: request.id, dueDate: waited.dueDate },
          data: { dueDate: next.dueDate },
        });
        if (moved.count === 1) await this.recordPause(tx, request, waited.dueDate!, next);
      });
    } catch (err) {
      this.logger.warn(`Request ${request.id}: service-level pause not applied (${String(err)})`);
    }
  }

  /**
   * The due date the SYSTEM sets on a request created without one, after the
   * fact (the employee path: an employee can't choose a due date — SS-05's
   * fence — so it is written on the staff connection once the raise commits).
   */
  async setInitialDue(request: { id: string; clientId: string; type: RequestType }): Promise<Date | null> {
    try {
      const dueDate = await this.dueFor(request.type, request.clientId);
      return await this.prisma.$transaction(async (tx) => {
        const set = await tx.request.updateMany({ where: { id: request.id, dueDate: null }, data: { dueDate } });
        if (set.count !== 1) return null;
        await this.audit.record(tx, {
          resource: 'request',
          resourceId: request.id,
          action: 'service-level-set',
          clientId: request.clientId,
          after: { dueDate: isoDay(dueDate) },
        });
        return dueDate;
      });
    } catch (err) {
      this.logger.warn(`Request ${request.id}: service-level due date not set (${String(err)})`);
      return null;
    }
  }

  private async weekFor(clientId: string): Promise<number[]> {
    const week = (await this.config.getAllForClient(clientId))['working.week'];
    return Array.isArray(week) && week.length > 0 ? (week as number[]) : FALLBACK_WEEK;
  }

  private async timezone(): Promise<string> {
    const tz = await this.config.get('timezone');
    return typeof tz === 'string' ? tz : 'Asia/Riyadh';
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
