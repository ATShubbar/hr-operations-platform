import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

// Accepts an inbound x-request-id (gateway/load balancer) or generates one,
// echoes it on the response, and runs the rest of the request inside the
// AsyncLocalStorage context so any code can read it without threading.
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  const ctx = requestContext.create(inbound && inbound.length <= 128 ? inbound : undefined);
  res.setHeader('x-request-id', ctx.requestId);
  requestContext.run(ctx, next);
}
