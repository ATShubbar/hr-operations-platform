import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './logging/json-logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
