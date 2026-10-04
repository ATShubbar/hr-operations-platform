// Public surface of the requests module (ADR-003; ACTION-PLAN 4.3).
export { RequestsModule } from './requests.module';
export { RequestsService } from './application/requests.service';
export { RequestThreadService } from './application/request-thread.service';
export { RequestAttachmentsService } from './application/request-attachments.service';
export { ServiceLevelService } from './application/service-level.service';
export { ATTACHMENT_DOWNLOAD_TTL_SECONDS, INVALID_ATTACHMENT } from './api/request-attachments.controller';
export { toSelfRequestResponse } from './domain/request-view';
export type { CreateRequestInput } from './domain/request';
// The domain events this module publishes (ADR-004). Consumers subscribe via
// @OnEvent(<Event>.NAME): Notifications on status change (REQ-03), Tasks on
// creation (TASK-03 — a request spawns a task).
export { RequestStatusChangedEvent } from './domain/request-status-changed.event';
export { RequestCreatedEvent } from './domain/request-created.event';
export { RequestCommentAddedEvent } from './domain/request-comment-added.event';
export { RequestAttachmentAddedEvent } from './domain/request-attachment-added.event';
