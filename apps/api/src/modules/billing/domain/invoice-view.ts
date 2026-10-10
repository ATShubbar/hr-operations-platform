import { isOverdue, type InvoiceResponse } from '@hr/contracts';
import type { Prisma } from '../../../generated/prisma/client';
import type { InvoiceModel as InvoiceRecord } from '../../../generated/prisma/models';

// The ONE mapping from an invoice record to what leaves the API, and its audit
// snapshot (BILL-05, ADR-020). "Overdue" is worked out here, from the day it
// is asked — it is never stored.

export type InvoiceFee = { id: string; ref: string; amountHalalas: number };
export type InvoiceRow = InvoiceRecord & { fees: InvoiceFee[] };

/** The fees an invoice recovers, as they are read with it. */
export const WITH_FEES = {
  fees: { select: { id: true, ref: true, amountHalalas: true }, orderBy: { ref: 'asc' } },
} as const satisfies Prisma.InvoiceInclude;

export const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

export function toInvoiceResponse(
  row: InvoiceRow,
  today: string,
  users: ReadonlyMap<string, string | null>,
): InvoiceResponse {
  const dueOn = dateOnly(row.dueOn);
  return {
    id: row.id,
    clientId: row.clientId,
    number: row.number,
    issuedOn: dateOnly(row.issuedOn),
    dueOn,
    amountHalalas: row.amountHalalas,
    status: row.status,
    paidOn: row.paidOn ? dateOnly(row.paidOn) : null,
    overdue: isOverdue({ status: row.status, dueOn }, today),
    fees: row.fees.map((f) => ({ id: f.id, ref: f.ref, amountHalalas: f.amountHalalas })),
    feesHalalas: row.fees.reduce((n, f) => n + f.amountHalalas, 0),
    recordedBy: row.recordedByUserId ? (users.get(row.recordedByUserId) ?? null) : null,
    recordedAt: row.createdAt.toISOString(),
  };
}

// What the audit trail keeps: the record as issued and the fees it recovers,
// by their references.
export function invoiceSnapshot(row: InvoiceRow): Prisma.InputJsonObject {
  return {
    number: row.number,
    issuedOn: dateOnly(row.issuedOn),
    dueOn: dateOnly(row.dueOn),
    amountHalalas: row.amountHalalas,
    status: row.status,
    paidOn: row.paidOn ? dateOnly(row.paidOn) : null,
    feeRefs: row.fees.map((f) => f.ref),
  };
}
