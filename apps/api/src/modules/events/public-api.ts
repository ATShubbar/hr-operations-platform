// Public surface of the events module (ADR-003, ADR-004). The in-process
// domain-event bus: producers inject EventBus and publish typed facts; consumers
// subscribe with @OnEvent(<Event>.NAME). Concrete events are owned by their
// publishing module and exported from that module's public-api, not here.
export { EventsModule } from './events.module';
export { EventBus } from './application/event-bus';
export type { DomainEvent } from './domain/domain-event';
