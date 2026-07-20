import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { requestContext } from '../context/request-context';
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

    // AUTH-03: declared endpoints require an authenticated actor — 401 when
    // the session middleware resolved nobody. (403 above = endpoint
    // misconfigured; 401 here = caller not logged in.)
    const actor = requestContext.get()?.actorId;
    if (!actor) throw new UnauthorizedException('Authentication required');

    // SEAM (AUTH-04): delegate to the policy service —
    //   return this.policy.can(actor, permission)
    return true;
  }
}
