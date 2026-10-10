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
  Query,
} from '@nestjs/common';
import {
  createFeeRequestSchema,
  feeQuerySchema,
  updateFeeRequestSchema,
  voidFeeRequestSchema,
  type FeeListResponse,
  type FeeResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import type { FeeModel as FeeRecord } from '../../../generated/prisma/models';
import { FeesService } from '../application/fees.service';
import { toFeeResponse } from '../domain/fee-view';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The government-fee ledger (BILL-01, ADR-020). STAFF ONLY — and checked here
// as well as by the permission: `scopeOf` refuses every non-staff principal
// first, so the money stays out of the client and employee paths even if a
// role were ever granted `fee.*` by mistake (a test widens the policy to prove
// it). Officers and the Administrator keep the ledger; the Auditor reads.
@Controller('fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @RequirePermission('fee.read')
  @Get()
  async list(@Query() query: unknown): Promise<FeeListResponse> {
    this.staffOnly();
    const parsed = feeQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid filter');
    return { fees: await this.present(await this.fees.list(parsed.data)) };
  }

  @RequirePermission('fee.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<FeeResponse> {
    this.staffOnly();
    const parsed = createFeeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid fee');
    return this.one(await this.fees.create(parsed.data));
  }

  @RequirePermission('fee.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<FeeResponse> {
    this.staffOnly();
    if (!UUID_RE.test(id)) throw new NotFoundException('Fee not found');
    const parsed = updateFeeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid correction');
    return this.one(await this.fees.update(id, parsed.data));
  }

  // `fee.delete` is VOID: the fee stays in the ledger with who, when and why.
  @RequirePermission('fee.delete')
  @Post(':id/void')
  @HttpCode(200)
  async void(@Param('id') id: string, @Body() body: unknown): Promise<FeeResponse> {
    this.staffOnly();
    if (!UUID_RE.test(id)) throw new NotFoundException('Fee not found');
    const parsed = voidFeeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Say why this fee is being voided');
    return this.one(await this.fees.void(id, parsed.data.reason));
  }

  private staffOnly(): void {
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('The fee ledger is staff only');
    }
  }

  private async present(rows: FeeRecord[]): Promise<FeeResponse[]> {
    const names = await this.fees.namesFor(rows);
    return rows.map((r) => toFeeResponse(r, names));
  }

  private async one(row: FeeRecord): Promise<FeeResponse> {
    return (await this.present([row]))[0]!;
  }
}
