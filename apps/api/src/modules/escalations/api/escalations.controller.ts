import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import {
  markEscalationsReadRequestSchema,
  type EscalationCountResponse,
  type EscalationLadderResponse,
  type MarkEscalationsReadResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { EscalationsService } from '../application/escalations.service';

// The notification centre's ladder (NC-01, ADR-021): what has reached which
// stage, for the person asking. STAFF for now — `scopeOf` refuses every other
// principal, whatever they hold; client managers and employees get their own
// paths in NC-05.
@Controller('escalations')
export class EscalationsController {
  constructor(private readonly escalations: EscalationsService) {}

  @RequirePermission('escalation.read')
  @Get()
  ladder(): Promise<EscalationLadderResponse> {
    this.staffOnly();
    return this.escalations.forStaff();
  }

  // The bell's number, without the whole ladder.
  @RequirePermission('escalation.read')
  @Get('count')
  async count(): Promise<EscalationCountResponse> {
    this.staffOnly();
    return { needsAction: await this.escalations.countForStaff() };
  }

  // Marks the caller's OWN items read. Under `escalation.read`, as marking a
  // bell item read is under `notification.read`: a read-state toggle on what
  // the person is already shown, not a change to any record.
  @RequirePermission('escalation.read')
  @Post('read')
  @HttpCode(200)
  async markRead(@Body() body: unknown): Promise<MarkEscalationsReadResponse> {
    this.staffOnly();
    const parsed = markEscalationsReadRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Send the keys of the items to mark read');
    return { marked: await this.escalations.markReadForStaff(parsed.data.keys) };
  }

  private staffOnly(): void {
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('The ladder is not available to this account yet');
    }
  }
}
