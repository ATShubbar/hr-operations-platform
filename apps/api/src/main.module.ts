import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { NotificationsWorkerModule } from './modules/notifications/public-api';
import { ExpiryWorkerModule } from './modules/document-expiry/public-api';

// Production root (NOTIF-01/03, EXP-02): the app PLUS the in-process workers — the
// notification email sender and the document-expiry daily scan/scheduler. Tests
// import AppModule alone (producers only); only the worker e2es opt a worker in.
// This keeps the BullMQ blocking worker connections out of every other spec's
// setup/teardown.
@Module({ imports: [AppModule, NotificationsWorkerModule, ExpiryWorkerModule] })
export class MainModule {}
