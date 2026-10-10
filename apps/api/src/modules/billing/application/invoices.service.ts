import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isOverdue,
  type AccountStanding,
  type CreateInvoiceRequest,
  type InvoiceResponse,
  type UpdateInvoiceRequest,
} from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { requestContext } from '../../../context/request-context';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import {
  dateOnly,
  invoiceSnapshot,
  toInvoiceResponse,
  WITH_FEES,
  type InvoiceRow,
} from '../domain/invoice-view';

// Invoice RECORDS (BILL-05, ADR-020). The invoice is issued from the
// accounting system; the Administrator records it here. Nothing is numbered,
// rendered or taxed: the number, dates and amount are kept AS ISSUED.
//
//   · the fees an invoice recovers become `invoiced` and point at it; a fee
//     can be on one invoice only, and must be this client's and still
//     `recorded` — all or nothing;
//   · `sent` until marked `paid` with the day it was paid; a paid record is
//     settled (un-mark it to correct it);
//   · "overdue" and the client's standing are DERIVED from the due date and
//     today's date in the system timezone — nobody sets them;
//   · a record entered in error is removed only while unpaid and recovering
//     no fee; removal is soft, and frees the number.
//
// Every write locks the invoice's row first, so a link and a removal of the
// same record cannot interleave.

type Tx = Prisma.TransactionClient;

export interface Standing {
  state: AccountStanding;
  outstandingHalalas: number;
  overdueHalalas: number;
  overdueCount: number;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
  ) {}

  async list(clientId: string): Promise<InvoiceResponse[]> {
    await this.clientOr404(clientId);
    const rows = await this.prisma.invoice.findMany({
      where: { clientId, removedAt: null },
      include: WITH_FEES,
      // Newest issue first; the number breaks ties so the order is stable.
      orderBy: [{ issuedOn: 'desc' }, { number: 'desc' }],
    });
    return this.present(rows);
  }

  // Derived from the records: nothing recorded is "none", never "paid up".
  async standingOf(clientId: string): Promise<Standing> {
    const [rows, today] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { clientId, removedAt: null },
        select: { status: true, dueOn: true, amountHalalas: true },
      }),
      this.today(),
    ]);
    const unpaid = rows.filter((r) => r.status === 'sent');
    const overdue = unpaid.filter((r) =>
      isOverdue({ status: r.status, dueOn: dateOnly(r.dueOn) }, today),
    );
    const sum = (list: typeof rows) => list.reduce((n, r) => n + r.amountHalalas, 0);
    return {
      state: rows.length === 0 ? 'none' : overdue.length > 0 ? 'overdue' : 'current',
      outstandingHalalas: sum(unpaid),
      overdueHalalas: sum(overdue),
      overdueCount: overdue.length,
    };
  }

  async create(clientId: string, input: CreateInvoiceRequest): Promise<InvoiceResponse> {
    await this.clientOr404(clientId);
    assertNotFuture(input.issuedOn, 'An invoice cannot be issued in the future');
    assertDueAfterIssue(input.issuedOn, input.dueOn);
    const actorId = requestContext.get()?.actorId ?? null;
    const row = await this.guardNumber(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            clientId,
            number: input.number,
            issuedOn: input.issuedOn,
            dueOn: input.dueOn,
            amountHalalas: input.amountHalalas,
            recordedByUserId: actorId,
          },
        });
        await this.link(tx, created.id, clientId, input.feeIds);
        const full = await tx.invoice.findUniqueOrThrow({
          where: { id: created.id },
          include: WITH_FEES,
        });
        await this.audit.record(tx, {
          resource: 'invoice',
          action: 'create',
          clientId,
          resourceId: full.id,
          after: invoiceSnapshot(full),
        });
        return full;
      }),
    );
    return this.one(row);
  }

  async update(id: string, input: UpdateInvoiceRequest): Promise<InvoiceResponse> {
    if (input.issuedOn) {
      assertNotFuture(input.issuedOn, 'An invoice cannot be issued in the future');
    }
    const row = await this.guardNumber(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await this.lock(tx, id);
        if (before.status === 'paid') {
          throw new ConflictException('A paid invoice is settled: mark it unpaid to correct it');
        }
        assertDueAfterIssue(input.issuedOn ?? before.issuedOn, input.dueOn ?? before.dueOn);
        await tx.invoice.update({
          where: { id },
          data: {
            ...(input.number !== undefined ? { number: input.number } : {}),
            ...(input.issuedOn !== undefined ? { issuedOn: input.issuedOn } : {}),
            ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
            ...(input.amountHalalas !== undefined ? { amountHalalas: input.amountHalalas } : {}),
          },
        });
        if (input.feeIds !== undefined) {
          // The set is REPLACED: a fee left out goes back to waiting.
          const wanted = new Set(input.feeIds);
          const held = new Set(before.fees.map((f) => f.id));
          const drop = [...held].filter((f) => !wanted.has(f));
          const add = [...wanted].filter((f) => !held.has(f));
          if (drop.length) {
            await tx.fee.updateMany({
              where: { id: { in: drop }, invoiceId: id },
              data: { status: 'recorded', invoiceId: null },
            });
          }
          await this.link(tx, id, before.clientId, add);
        }
        const after = await tx.invoice.findUniqueOrThrow({ where: { id }, include: WITH_FEES });
        await this.audit.record(tx, {
          resource: 'invoice',
          action: 'update',
          clientId: after.clientId,
          resourceId: id,
          before: invoiceSnapshot(before),
          after: invoiceSnapshot(after),
        });
        return after;
      }),
    );
    return this.one(row);
  }

  async markPaid(id: string, paidOn: Date): Promise<InvoiceResponse> {
    assertNotFuture(paidOn, 'An invoice cannot be paid in the future');
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status === 'paid') throw new ConflictException('This invoice is already paid');
      if (paidOn < before.issuedOn) {
        throw new BadRequestException('An invoice cannot be paid before it was issued');
      }
      const after = await tx.invoice.update({
        where: { id },
        data: { status: 'paid', paidOn },
        include: WITH_FEES,
      });
      await this.audit.record(tx, {
        resource: 'invoice',
        action: 'paid',
        clientId: after.clientId,
        resourceId: id,
        before: invoiceSnapshot(before),
        after: invoiceSnapshot(after),
      });
      return after;
    });
    return this.one(row);
  }

  // "Paid" set by mistake: back to sent, with no day paid.
  async markUnpaid(id: string): Promise<InvoiceResponse> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== 'paid') throw new ConflictException('This invoice is not marked paid');
      const after = await tx.invoice.update({
        where: { id },
        data: { status: 'sent', paidOn: null },
        include: WITH_FEES,
      });
      await this.audit.record(tx, {
        resource: 'invoice',
        action: 'unpaid',
        clientId: after.clientId,
        resourceId: id,
        before: invoiceSnapshot(before),
        after: invoiceSnapshot(after),
      });
      return after;
    });
    return this.one(row);
  }

  // Only a record entered in error: unpaid, recovering no fee. Soft — the row
  // stays, out of every list and figure, and its number is free again.
  async remove(id: string): Promise<void> {
    const actorId = requestContext.get()?.actorId ?? null;
    await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status === 'paid') {
        throw new ConflictException('A paid invoice is not removed: mark it unpaid first');
      }
      if (before.fees.length > 0) {
        throw new ConflictException(
          'This invoice recovers fees: correct it instead of removing it',
        );
      }
      await tx.invoice.update({
        where: { id },
        data: { removedAt: new Date(), removedByUserId: actorId },
      });
      await this.audit.record(tx, {
        resource: 'invoice',
        action: 'remove',
        clientId: before.clientId,
        resourceId: id,
        before: invoiceSnapshot(before),
      });
    });
  }

  // All or nothing: every fee must be this client's and still `recorded`.
  // Conditional on the status, so a fee voided or invoiced in the meantime
  // loses here and the whole write rolls back.
  private async link(tx: Tx, invoiceId: string, clientId: string, feeIds: readonly string[]) {
    if (feeIds.length === 0) return;
    const changed = await tx.fee.updateMany({
      where: { id: { in: [...feeIds] }, clientId, status: 'recorded' },
      data: { status: 'invoiced', invoiceId },
    });
    if (changed.count !== feeIds.length) {
      throw new ConflictException(
        "A fee is not this client's, or is no longer waiting to be invoiced",
      );
    }
  }

  // Locks the record for the rest of the transaction. A removed record is
  // gone for every further act.
  private async lock(tx: Tx, id: string): Promise<InvoiceRow> {
    await tx.$queryRaw`SELECT id FROM bil_invoices WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.invoice.findUnique({ where: { id }, include: WITH_FEES });
    if (!row || row.removedAt) throw new NotFoundException('Invoice not found');
    return row;
  }

  // One live record per number per client: the partial unique index refused it.
  private async guardNumber<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'An invoice with this number is already recorded for this client',
        );
      }
      throw err;
    }
  }

  private async clientOr404(clientId: string): Promise<void> {
    if (!(await this.clients.getById(clientId))) throw new NotFoundException('Client not found');
  }

  /** Today's date where the business is: the system timezone, as YYYY-MM-DD. */
  private async today(): Promise<string> {
    const tz = await this.config.get('timezone');
    return dateOnly(dayIn(new Date(), typeof tz === 'string' ? tz : 'Asia/Riyadh'));
  }

  private async present(rows: InvoiceRow[]): Promise<InvoiceResponse[]> {
    const ids = rows.flatMap((r) => (r.recordedByUserId ? [r.recordedByUserId] : []));
    const [names, today] = await Promise.all([this.users.displayNames(ids), this.today()]);
    return rows.map((r) => toInvoiceResponse(r, today, names));
  }

  private async one(row: InvoiceRow): Promise<InvoiceResponse> {
    return (await this.present([row]))[0] as InvoiceResponse;
  }
}

// A date has no zone, and Riyadh's today begins three hours before UTC's: one
// day of slack, as for a fee's payment date.
function assertNotFuture(day: Date, message: string): void {
  const limit = new Date();
  limit.setUTCHours(0, 0, 0, 0);
  limit.setUTCDate(limit.getUTCDate() + 1);
  if (day > limit) throw new BadRequestException(message);
}

function assertDueAfterIssue(issuedOn: Date, dueOn: Date): void {
  if (dueOn < issuedOn) throw new BadRequestException('An invoice is not due before it is issued');
}
