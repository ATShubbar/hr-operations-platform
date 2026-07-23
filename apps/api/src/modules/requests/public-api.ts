// Public surface of the requests module (ADR-003; ACTION-PLAN 4.3).
export { RequestsModule } from './requests.module';
export { RequestsService } from './application/requests.service';
export type { CreateRequestInput } from './domain/request';
// The domain event this module publishes on a status change (REQ-03, ADR-004).
// Consumers (Notifications) subscribe via @OnEvent(RequestStatusChangedEvent.NAME).
export { RequestStatusChangedEvent } from './domain/request-status-changed.event';
