import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEvent } from '../domain/domain-event';

// The in-process domain-event bus (ADR-004, NOTIF-05). Publishers call
// publish(event); consumers subscribe with @OnEvent(<Event>.NAME). The producer
// does not know its consumers — adding one never touches the producer.
//
// Delivery is best-effort and AWAITED in-process: publish resolves once every
// handler has run, so a producer that awaits it keeps its own ordering (e.g. the
// expiry scan's claim-ledger → publish stays at-most-once). A handler that throws
// is ISOLATED — logged, never propagated — so one failing consumer can't break
// the producer or the other consumers. Effects that must survive a crash use the
// transactional outbox instead (ADR-004; not needed for best-effort notifications).
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: DomainEvent): Promise<void> {
    try {
      await this.emitter.emitAsync(event.name, event);
    } catch (err) {
      // Best-effort: a consumer failure is logged, not surfaced to the producer.
      this.logger.error(
        `handler failed for event '${event.name}' (correlationId=${event.correlationId ?? 'none'})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
