import type { LoggerService } from '@nestjs/common';
import { requestContext } from '../context/request-context';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

// Structured JSON logging (one line per entry) with request context merged
// into every line. Deliberately dependency-free; if a transport/formatter
// library (e.g. pino) is ever needed, the swap is contained to this file.
export class JsonLogger implements LoggerService {
  private write(level: Level, message: unknown, meta?: Record<string, unknown>): void {
    const ctx = requestContext.get();
    process.stdout.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        requestId: ctx?.requestId ?? null,
        actorId: ctx?.actorId ?? null,
        clientId: ctx?.clientId ?? null,
        ...meta,
      })}\n`,
    );
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context ? { context } : undefined);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, { ...(stack ? { stack } : {}), ...(context ? { context } : {}) });
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context ? { context } : undefined);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context ? { context } : undefined);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context ? { context } : undefined);
  }
}
