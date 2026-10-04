import { Injectable } from '@nestjs/common';
import type {
  EmployeeLeaveResponse,
  LeaveBalanceListResponse,
  LeaveHistoryEntry,
} from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeScopedPrismaService } from '../../../prisma/employee-scoped-prisma.service';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { EmployeeModel as EmployeeRecord } from '../../../generated/prisma/models';
import { EmployeesService } from '../../employees/public-api';
import { computeBalance, riyadhToday, type LedgerRow } from '../domain/leave-balance';

// Balances (ADR-014, LEAVE-03). The arithmetic is the pure domain function; this
// service only gathers its inputs — the ledger and the pending annual requests —
// through the SAME fenced path as the caller (staff, client manager via RLS,
// employee via RLS), and names the people. `now` is injectable so a test can say
// what "today" is.
//
// Reads go through a minimal interface both a Prisma client and a scoped
// transaction satisfy.
type LeaveReads = Pick<Prisma.TransactionClient, 'leaveEntry' | 'leaveRequest'>;

const day = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class LeaveBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoped: ScopedPrismaService,
    private readonly employeeDb: EmployeeScopedPrismaService,
    private readonly employees: EmployeesService,
  ) {}

  // Everyone still employed — across clients (staff) or at one client.
  async listForStaff(filters: { clientId?: string }, now?: Date): Promise<LeaveBalanceListResponse> {
    const people = await this.employees.list(filters.clientId);
    return this.balances(this.prisma, people, now);
  }

  async listForClient(clientId: string, now?: Date): Promise<LeaveBalanceListResponse> {
    const people = await this.employees.listByClient(clientId);
    return this.scoped.transaction(clientId, (tx) => this.balances(tx, people, now));
  }

  async oneForStaff(employeeId: string, now?: Date): Promise<EmployeeLeaveResponse | null> {
    const person = await this.employees.getById(employeeId);
    if (!person) return null;
    return this.one(this.prisma, person, now);
  }

  // Another company's employee is simply not found (→ 404), like every client read.
  async oneForClient(clientId: string, employeeId: string, now?: Date): Promise<EmployeeLeaveResponse | null> {
    const person = await this.employees.getById(employeeId);
    if (!person || person.clientId !== clientId) return null;
    return this.scoped.transaction(clientId, (tx) => this.one(tx, person, now));
  }

  async mine(employeeId: string, now?: Date): Promise<EmployeeLeaveResponse | null> {
    const person = await this.employees.getSelf(employeeId);
    if (!person) return null;
    return this.employeeDb.transaction(employeeId, (tx) => this.one(tx, person, now));
  }

  // ---- shared ------------------------------------------------------------------

  private async balances(
    db: LeaveReads,
    people: EmployeeRecord[],
    now?: Date,
  ): Promise<LeaveBalanceListResponse> {
    const today = riyadhToday(now);
    const current = people.filter((p) => p.employmentStatus !== 'terminated');
    const ids = current.map((p) => p.id);
    const [entries, pending] = await Promise.all([
      db.leaveEntry.findMany({ where: { employeeId: { in: ids }, leaveYear: today.getUTCFullYear() } }),
      this.pendingAnnual(db, ids),
    ]);
    const byPerson = groupBy(entries, (e) => e.employeeId);
    return {
      today: day(today),
      balances: current.map((p) => ({
        employee: employeeView(p),
        balance: computeBalance({
          hireDate: p.hireDate,
          today,
          entries: byPerson.get(p.id) ?? [],
          pendingAnnualDays: pending.get(p.id) ?? 0,
        }),
      })),
    };
  }

  private async one(db: LeaveReads, person: EmployeeRecord, now?: Date): Promise<EmployeeLeaveResponse> {
    const today = riyadhToday(now);
    const [entries, pending] = await Promise.all([
      db.leaveEntry.findMany({
        where: { employeeId: person.id },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.pendingAnnual(db, [person.id]),
    ]);
    // Name each spell by its request's reference, read on the same path.
    const requestIds = [...new Set(entries.flatMap((e) => (e.requestId ? [e.requestId] : [])))];
    const refs = new Map(
      (
        await db.leaveRequest.findMany({ where: { id: { in: requestIds } }, select: { id: true, ref: true } })
      ).map((r) => [r.id, r.ref]),
    );
    const history: LeaveHistoryEntry[] = entries
      .filter((e) => e.kind === 'taken' && e.startDate && e.endDate)
      .map((e) => ({
        ref: e.requestId ? (refs.get(e.requestId) ?? null) : null,
        type: e.type,
        startDate: day(e.startDate!),
        endDate: day(e.endDate!),
        days: e.days,
        leaveYear: e.leaveYear,
        state: e.endDate!.getTime() <= today.getTime() ? 'taken' : 'booked',
      }));
    return {
      today: day(today),
      employee: employeeView(person),
      balance: computeBalance({
        hireDate: person.hireDate,
        today,
        entries: entries as LedgerRow[],
        pendingAnnualDays: pending.get(person.id) ?? 0,
      }),
      history,
    };
  }

  // Annual leave asked for but not yet filed: pending or approved.
  private async pendingAnnual(db: LeaveReads, employeeIds: string[]): Promise<Map<string, number>> {
    const rows = await db.leaveRequest.groupBy({
      by: ['employeeId'],
      where: { employeeId: { in: employeeIds }, type: 'annual', status: { in: ['pending', 'approved'] } },
      _sum: { days: true },
    });
    return new Map(rows.map((r) => [r.employeeId, r._sum.days ?? 0]));
  }
}

function employeeView(p: EmployeeRecord) {
  return {
    id: p.id,
    clientId: p.clientId,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    hireDate: p.hireDate ? day(p.hireDate) : null,
  };
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}
