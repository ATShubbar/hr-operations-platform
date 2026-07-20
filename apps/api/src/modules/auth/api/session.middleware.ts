import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../../../context/request-context';
import { SESSION_COOKIE, SessionsService } from '../application/sessions.service';

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Resolves the session cookie into the request context (AUTH-03). Runs AFTER
// the context middleware (registration order in AppModule). Invalid, expired,
// or absent sessions are simply "unauthenticated" — never an error here; the
// PermissionsGuard decides what that means per endpoint.
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (sessionId) {
      const session = await this.sessions.get(sessionId);
      const ctx = requestContext.get();
      if (session && ctx) {
        ctx.actorId = session.userId;
        ctx.clientId = session.clientId;
        ctx.principalType = session.principalType;
      }
    }
    next();
  }
}
