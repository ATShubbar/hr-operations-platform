import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PUBLIC_KEY } from './permissions.decorator';

// Deny by default (ADR-002): an endpoint with NEITHER @Public() NOR
// @RequirePermission() is unreachable. Forgetting the annotation fails
// closed, loudly, in every environment.
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    if (isPublic) return true;

    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, targets);
    if (!permission) {
      this.logger.warn(
        `deny-by-default: ${context.getClass().name}.${context.getHandler().name} has no permission metadata`,
      );
      throw new ForbiddenException('Endpoint has no declared permission');
    }

    // SEAM (Priority 2, ACTION-PLAN 2.2): resolve the actor from the request
    // context and delegate to the policy service:
    //   return this.policy.can(actor, permission)
    // Until authentication exists there is no actor to evaluate, so declared
    // endpoints pass. The deny-by-default mechanism above is what this task
    // ships and what the isolation harness (WS-18) relies on.
    return true;
  }
}
