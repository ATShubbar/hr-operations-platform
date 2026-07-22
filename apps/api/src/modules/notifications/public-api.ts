// Public surface of the notifications module (ADR-003). NotificationsService.notify()
// is how producers (the document-expiry engine, 3.4, and others) raise a
// notification; the store and read API stay private.
export { NotificationsModule } from './notifications.module';
export { NotificationsService } from './application/notifications.service';
export { NotificationsWorkerModule } from './notifications-worker.module';
export { NotificationDispatchService } from './application/notification-dispatch.service';
export type { NotifyInput } from './domain/notification';
// The email seam (NOTIF-03): the token + interface (so production binds a real
// SMTP transport) and the dev capture transport (for inspecting sent mail).
export { EMAIL_TRANSPORT, type EmailTransport, type EmailMessage } from './domain/email';
export { CaptureEmailTransport } from './infra/capture-email-transport';
