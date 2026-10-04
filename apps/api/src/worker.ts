import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MainModule } from './main.module';
import { JsonLogger } from './logging/json-logger';

// The background workers WITHOUT an HTTP listener (GCP-04) — what the Cloud Run
// worker pool runs (`uat-worker`, always on). It is MainModule (the app + the
// notification and expiry workers) as an application context: every provider,
// queue and event handler is live, but no port is opened. Shutdown hooks close
// the BullMQ workers and connections cleanly on SIGTERM.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MainModule, {
    logger: new JsonLogger(),
  });
  app.enableShutdownHooks();
}

void bootstrap();
