import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { JsonLogger } from '../src/logging/json-logger';

interface LogLine {
  requestId?: string | null;
  message?: string;
  level?: string;
}

describe('Request context + structured logging (e2e)', () => {
  let app: INestApplication;
  const captured: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  beforeAll(async () => {
    process.stdout.write = ((chunk: unknown): boolean => {
      captured.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: new JsonLogger() });
    app.useLogger(new JsonLogger());
    await app.init();
  });

  afterAll(async () => {
    process.stdout.write = originalWrite;
    await app.close();
  });

  function jsonLines(): LogLine[] {
    return captured
      .flatMap((c) => c.split('\n'))
      .filter((l) => l.trim().startsWith('{'))
      .map((l) => {
        try {
          return JSON.parse(l) as LogLine;
        } catch {
          return {};
        }
      });
  }

  it('propagates an inbound x-request-id through every log line of the request', async () => {
    const traceId = 'ws14-trace-proof-001';
    const res = await request(app.getHttpServer())
      .get('/example/greeting')
      .set('x-request-id', traceId)
      .expect(200);

    expect(res.headers['x-request-id']).toBe(traceId);

    const lines = jsonLines().filter((l) => l.requestId === traceId);
    // At least the service log ("greeting served") and the access log line.
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.message?.includes('greeting served'))).toBe(true);
    expect(lines.some((l) => l.message?.includes('GET /example/greeting 200'))).toBe(true);
  });

  it('generates distinct request ids when none is supplied', async () => {
    const res1 = await request(app.getHttpServer()).get('/example/greeting').expect(200);
    const res2 = await request(app.getHttpServer()).get('/example/greeting').expect(200);
    expect(res1.headers['x-request-id']).toBeTruthy();
    expect(res2.headers['x-request-id']).toBeTruthy();
    expect(res1.headers['x-request-id']).not.toBe(res2.headers['x-request-id']);
  });

  it('keeps health endpoints out of the access log', async () => {
    const before = jsonLines().filter((l) => l.message?.includes('/health')).length;
    await request(app.getHttpServer()).get('/health').expect(200);
    const after = jsonLines().filter((l) => l.message?.includes('/health')).length;
    expect(after).toBe(before);
  });
});
