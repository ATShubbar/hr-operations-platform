import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const QUIET_PATHS = new Set(['/health', '/ready']);

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (QUIET_PATHS.has(req.path)) return next.handle();

    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logAccess(context, req, started),
        error: () => this.logAccess(context, req, started),
      }),
    );
  }

  private logAccess(context: ExecutionContext, req: Request, started: number): void {
    const res = context.switchToHttp().getResponse<Response>();
    this.logger.log(
      `${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`,
    );
  }
}
