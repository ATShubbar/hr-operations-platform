import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { NotificationsWorkerModule } from './modules/notifications/public-api';

// Production root (NOTIF-01/03): the app PLUS the in-process dispatch worker (the
// notification email sender). Tests import AppModule alone (producers only); only
// the worker e2e opts the worker in. This keeps the BullMQ blocking worker
// connection out of every other spec's setup/teardown.
@Module({ imports: [AppModule, NotificationsWorkerModule] })
export class MainModule {}
