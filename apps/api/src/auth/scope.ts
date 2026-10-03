import { ForbiddenException } from '@nestjs/common';
import type { RequestContext } from '../context/request-context';

// Which data path a dual-path endpoint takes (SS-01).
//
// Three controllers — requests, vacancies, GRO — serve both staff (cross-client)
// and client representatives (own client, via ScopedPrismaService + RLS). They
// used to decide with `principalType === 'client_rep' && clientId ? rep : staff`,
// which reads as a two-way choice and is really "anything that is not a
// well-formed client rep gets the CROSS-CLIENT path". Two ways in:
//
//   - a client rep whose session has no clientId (should be impossible, and is
//     now refused by a CHECK constraint — but a fail-open default is exactly
//     what a "should be impossible" case must not reach);
//   - the `employee` principal (ADR-011), which falls into the else-branch the
//     moment it holds a permission one of these routes accepts.
//
// This makes the choice exhaustive: staff → staff, a client rep WITH a company →
// client, everything else → 403. Adding a principal type is now a compile-time
// question here rather than a silent widening at each call site. A source scan
// in test/scope.e2e-spec.ts fails the build if the old inline test reappears.

export type DataScope = { kind: 'staff' } | { kind: 'client'; clientId: string };

export function scopeOf(ctx: RequestContext | undefined): DataScope {
  switch (ctx?.principalType) {
    case 'staff':
      return { kind: 'staff' };
    case 'client_rep':
      if (ctx.clientId) return { kind: 'client', clientId: ctx.clientId };
      throw new ForbiddenException('Client representative has no client scope');
    case 'employee':
      // Self-service has its own endpoints (ADR-011); the dual-path resources
      // grow an `employee` scope only when a card designs one (SS-05 requests).
      throw new ForbiddenException('Not available to employee accounts');
    default:
      throw new ForbiddenException('No data scope for this principal');
  }
}
