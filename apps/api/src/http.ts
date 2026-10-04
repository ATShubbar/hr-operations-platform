import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './logging/json-logger';

// The HTTP API WITHOUT the background workers (GCP-04) — what the request-driven
// Cloud Run service runs (`uat-api`). Cloud Run scales it to zero and throttles
// its CPU between requests, so the BullMQ workers must NOT live here; they run
// in worker.ts, on an always-on worker pool. Local dev keeps main.ts (HTTP +
// workers in one process).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
