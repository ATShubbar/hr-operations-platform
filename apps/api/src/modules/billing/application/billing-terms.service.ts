import { Injectable, NotFoundException } from '@nestjs/common';
import {
  estimateSubscription,
  isUnderManagement,
  type BillingSummaryResponse,
  type BillingTerms,
} from '@hr/contracts';
import { requestContext } from '../../../context/request-context';
import type { Prisma } from '../../../generated/prisma/client';
import type { BillingTermsModel as TermsRecord } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/public-api';
import { UsersService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { EmployeesService } from '../../employees/public-api';
import { InvoicesService } from './invoices.service';

// A client's commercial terms and what they come to (BILL-04, ADR-020).
//
// The TERMS are stored: a platform fee and a rate per employee, per month, in
// whole halalas; the cycle; a purchase order; the payment terms. One set per
// client, replaced as a whole and audited before → after.
//
// The ESTIMATE is never stored — it is arithmetic at the moment of asking:
// the people under management (the ONE headcount rule, REP-06) at the rate,
// plus the platform fee, for the cycle, plus the fees not yet recovered. It is
// not an invoice: the invoice is issued from the accounting system, and no VAT
// is calculated here.

const termsOf = (row: TermsRecord): BillingTerms => ({
  platformFeeHalalas: row.platformFeeHalalas,
  seatRateHalalas: row.seatRateHalalas,
  cycle: row.cycle,
  poNumber: row.poNumber,
  paymentTermsDays: row.paymentTermsDays,
});

@Injectable()
export class BillingTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly clients: ClientsService,
    private readonly employees: EmployeesService,
    private readonly invoices: InvoicesService,
  ) {}

  async summary(clientId: string): Promise<BillingSummaryResponse> {
    const client = await this.clients.getById(clientId);
    if (!client) throw new NotFoundException('Client not found');
    const [row, people, owed, standing] = await Promise.all([
      this.prisma.billingTerms.findUnique({ where: { clientId } }),
      this.employees.list(clientId),
      // Every fee still `recorded`, whatever its age: not void, not on an invoice.
      this.prisma.fee.aggregate({
        where: { clientId, status: 'recorded' },
        _sum: { amountHalalas: true },
      }),
      // BILL-05: derived from the invoice records, never set by hand.
      this.invoices.standingOf(clientId),
    ]);
    const unrecoveredFeesHalalas = owed._sum.amountHalalas ?? 0;
    if (!row) {
      return {
        clientId,
        terms: null,
        estimate: null,
        unrecoveredFeesHalalas,
        standing,
        termsUpdatedBy: null,
        termsUpdatedAt: null,
      };
    }
    const headcount = people.filter((p) =>
      isUnderManagement(p.employmentStatus, client.status),
    ).length;
    const terms = termsOf(row);
    const estimate = estimateSubscription(terms, headcount);
    const names = row.updatedByUserId
      ? await this.users.displayNames([row.updatedByUserId])
      : new Map<string, string | null>();
    return {
      clientId,
      terms,
      estimate: { ...estimate, nextInvoiceHalalas: estimate.cycleHalalas + unrecoveredFeesHalalas },
      unrecoveredFeesHalalas,
      standing,
      termsUpdatedBy: row.updatedByUserId ? (names.get(row.updatedByUserId) ?? null) : null,
      termsUpdatedAt: row.updatedAt.toISOString(),
    };
  }

  // The whole set is replaced: terms are a small agreement read as one thing,
  // and a partial write could leave a rate from one agreement beside a cycle
  // from another.
  async save(clientId: string, terms: BillingTerms): Promise<BillingSummaryResponse> {
    const client = await this.clients.getById(clientId);
    if (!client) throw new NotFoundException('Client not found');
    const actorId = requestContext.get()?.actorId ?? null;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.billingTerms.findUnique({ where: { clientId } });
      const data = { ...terms, updatedByUserId: actorId };
      const row = before
        ? await tx.billingTerms.update({ where: { clientId }, data })
        : await tx.billingTerms.create({ data: { clientId, ...data } });
      await this.audit.record(tx, {
        resource: 'billing-terms',
        action: before ? 'update' : 'create',
        clientId,
        resourceId: clientId,
        ...(before ? { before: termsOf(before) as Prisma.InputJsonObject } : {}),
        after: termsOf(row) as Prisma.InputJsonObject,
      });
    });
    return this.summary(clientId);
  }
}
