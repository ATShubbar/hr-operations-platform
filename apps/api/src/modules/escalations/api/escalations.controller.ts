import { Controller, ForbiddenException, Get } from '@nestjs/common';
import type { EscalationLadderResponse } from '@hr/contracts';
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
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('The ladder is not available to this account yet');
    }
    return this.escalations.forStaff();
  }
}
