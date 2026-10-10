import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  markEscalationsReadRequestSchema,
  type EscalationCountResponse,
  type EscalationLadderResponse,
  type MarkEscalationsReadResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { EscalationsService, type LadderView } from '../application/escalations.service';

// The notification centre's ladder (ADR-021): what has reached which stage,
// for the person asking. Staff (NC-01) and client managers (NC-05) share these
// routes; `scopeOf` decides the path from the SESSION — staff see the register
// they may read, a client manager their own company — and refuses every other
// principal whatever it holds. Employees have their own routes under `/me`.
@Controller('escalations')
export class EscalationsController {
  constructor(private readonly escalations: EscalationsService) {}

  @RequirePermission('escalation.read')
  @Get()
  ladder(): Promise<EscalationLadderResponse> {
    return this.escalations.ladder(this.view());
  }

  // The bell's number, without the whole ladder.
  @RequirePermission('escalation.read')
  @Get('count')
  async count(): Promise<EscalationCountResponse> {
    return { needsAction: await this.escalations.count(this.view()) };
  }

  // Marks the caller's OWN items read. Under `escalation.read`, as marking a
  // bell item read is under `notification.read`: a read-state toggle on what
  // the person is already shown, not a change to any record.
  @RequirePermission('escalation.read')
  @Post('read')
  @HttpCode(200)
  async markRead(@Body() body: unknown): Promise<MarkEscalationsReadResponse> {
    const view = this.view();
    const parsed = markEscalationsReadRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Send the keys of the items to mark read');
    return { marked: await this.escalations.markRead(view, parsed.data.keys) };
  }

  // Staff, or a client manager for their own company. `scopeOf` throws 403 for
  // anyone else (an employee, a client account with no company).
  private view(): LadderView {
    const scope = scopeOf(requestContext.get());
    return scope.kind === 'client'
      ? { kind: 'client', clientId: scope.clientId }
      : { kind: 'staff' };
  }
}
