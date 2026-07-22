import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MainModule } from './main.module';
import { JsonLogger } from './logging/json-logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(MainModule, { logger: new JsonLogger() });
  // Fire OnModuleDestroy on SIGTERM/SIGINT so BullMQ workers (NOTIF-01) and
  // Redis/DB connections close gracefully instead of being killed mid-job.
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
