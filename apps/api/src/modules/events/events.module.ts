import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBus } from './application/event-bus';

// The shared domain-event backbone (ADR-004, NOTIF-05). @Global so any module can
// inject EventBus (publish) and register @OnEvent handlers without importing this
// module. EventEmitterModule.forRoot() is initialised once here; the wrapper
// (EventBus) is the typed publish surface producers use.
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [EventBus],
  exports: [EventBus],
})
export class EventsModule {}
