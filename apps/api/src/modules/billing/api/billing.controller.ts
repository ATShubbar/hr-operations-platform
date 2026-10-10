import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { billingTermsSchema, type BillingSummaryResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { BillingTermsService } from '../application/billing-terms.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A client's commercial terms and the estimate (BILL-04, ADR-020). The
// Administrator keeps them (`billing.update`); the Auditor reads
// (`billing.read`); officers hold neither. STAFF ONLY, checked here as well as
// by the permission — `scopeOf` refuses every non-staff principal first, so a
// client could not read its own terms even if a client role were ever granted
// `billing.*` by mistake (a test widens the policy to prove it).
@Controller('billing')
export class BillingController {
  constructor(private readonly terms: BillingTermsService) {}

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

  private staffOnly(): void {
    const scope = scopeOf(requestContext.get());
    if (scope.kind !== 'staff') throw new ForbiddenException('Staff only');
  }
}
