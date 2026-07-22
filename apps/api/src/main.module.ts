import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { DispatchWorkerModule } from './modules/queue/public-api';

// Production root (NOTIF-01): the app PLUS the in-process dispatch worker. Tests
// import AppModule alone (producers only); only the queue e2e opts the worker
// in. This keeps the BullMQ blocking worker connection out of every other spec's
// setup/teardown.
@Module({ imports: [AppModule, DispatchWorkerModule] })
export class MainModule {}
