import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';

// Client-scoped exemplar endpoint (WS-18): the contract every client-scoped
// endpoint follows — client identity comes from the request context (set by
// auth in Priority 2), data access goes through ScopedPrismaService only.
@Controller('scope-check')
export class ScopeCheckController {
  constructor(private readonly scoped: ScopedPrismaService) {}

  @RequirePermission('scope-check.read')
  @Get()
  async list() {
    const clientId = requestContext.get()?.clientId;
    if (!clientId) throw new ForbiddenException('No client scope on request');
    return this.scoped.forClient(clientId).coreScopeCheck.findMany();
  }
}
