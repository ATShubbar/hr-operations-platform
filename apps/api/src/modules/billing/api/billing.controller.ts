import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  billingTermsSchema,
  createInvoiceRequestSchema,
  markInvoicePaidRequestSchema,
  updateInvoiceRequestSchema,
  type BillingSummaryResponse,
  type InvoiceListResponse,
  type InvoiceResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { BillingTermsService } from '../application/billing-terms.service';
import { InvoicesService } from '../application/invoices.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A client's commercial terms and the estimate (BILL-04, ADR-020). The
// Administrator keeps them (`billing.update`); the Auditor reads
// (`billing.read`); officers hold neither. STAFF ONLY, checked here as well as
// by the permission — `scopeOf` refuses every non-staff principal first, so a
// client could not read its own terms even if a client role were ever granted
// `billing.*` by mistake (a test widens the policy to prove it).
@Controller('billing')
export class BillingController {
  constructor(
    private readonly terms: BillingTermsService,
    private readonly invoices: InvoicesService,
  ) {}

  @RequirePermission('billing.read')
  @Get('clients/:clientId')
  summary(@Param('clientId') clientId: string): Promise<BillingSummaryResponse> {
    this.staffOnly();
    if (!UUID_RE.test(clientId)) throw new NotFoundException('Client not found');
    return this.terms.summary(clientId);
  }

  @RequirePermission('billing.update')
  @Put('clients/:clientId/terms')
  save(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
  ): Promise<BillingSummaryResponse> {
    this.staffOnly();
    if (!UUID_RE.test(clientId)) throw new NotFoundException('Client not found');
    const parsed = billingTermsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid terms');
    return this.terms.save(clientId, parsed.data);
  }

  // ---- invoice records (BILL-05) ----
  // The invoice is issued from the accounting system; these routes keep the
  // RECORD of it. Same wall as the terms: `billing.*`, staff only.

  @RequirePermission('billing.read')
  @Get('clients/:clientId/invoices')
  async listInvoices(@Param('clientId') clientId: string): Promise<InvoiceListResponse> {
    this.staffOnly();
    if (!UUID_RE.test(clientId)) throw new NotFoundException('Client not found');
    return { invoices: await this.invoices.list(clientId) };
  }

  @RequirePermission('billing.update')
  @Post('clients/:clientId/invoices')
  @HttpCode(201)
  createInvoice(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
  ): Promise<InvoiceResponse> {
    this.staffOnly();
    if (!UUID_RE.test(clientId)) throw new NotFoundException('Client not found');
    const parsed = createInvoiceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid invoice record');
    return this.invoices.create(clientId, parsed.data);
  }

  @RequirePermission('billing.update')
  @Patch('invoices/:id')
  updateInvoice(@Param('id') id: string, @Body() body: unknown): Promise<InvoiceResponse> {
    this.staffOnly();
    if (!UUID_RE.test(id)) throw new NotFoundException('Invoice not found');
    const parsed = updateInvoiceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid correction');
    return this.invoices.update(id, parsed.data);
  }

  @RequirePermission('billing.update')
  @Post('invoices/:id/paid')
  @HttpCode(200)
  markPaid(@Param('id') id: string, @Body() body: unknown): Promise<InvoiceResponse> {
    this.staffOnly();
    if (!UUID_RE.test(id)) throw new NotFoundException('Invoice not found');
    const parsed = markInvoicePaidRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Say which day it was paid');
    return this.invoices.markPaid(id, parsed.data.paidOn);
  }

  @RequirePermission('billing.update')
  @Post('invoices/:id/unpaid')
  @HttpCode(200)
  markUnpaid(@Param('id') id: string): Promise<InvoiceResponse> {
    this.staffOnly();
    if (!UUID_RE.test(id)) throw new NotFoundException('Invoice not found');
    return this.invoices.markUnpaid(id);
  }

  // Soft: the record stays, out of every list and figure.
  @RequirePermission('billing.update')
  @Post('invoices/:id/remove')
  @HttpCode(200)
  async removeInvoice(@Param('id') id: string): Promise<{ removed: true }> {
    this.staffOnly();
    if (!UUID_RE.test(id)) throw new NotFoundException('Invoice not found');
    await this.invoices.remove(id);
    return { removed: true };
  }

  private staffOnly(): void {
    const scope = scopeOf(requestContext.get());
    if (scope.kind !== 'staff') throw new ForbiddenException('Staff only');
  }
}
