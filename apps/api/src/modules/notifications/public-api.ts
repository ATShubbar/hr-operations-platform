// Public surface of the notifications module (ADR-003). NotificationsService.notify()
// is how producers (the document-expiry engine, 3.4, and others) raise a
// notification; the store and read API stay private.
export { NotificationsModule } from './notifications.module';
export { NotificationsService } from './application/notifications.service';
export type { NotifyInput } from './domain/notification';
