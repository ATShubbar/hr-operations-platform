import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DependantRemovedEvent } from '../../employees/public-api';
import { GroProcessesService } from './gro-processes.service';

// GRO subscribes to "a dependant was removed" (DEP-06a, ADR-017 rev. 2; ADR-004):
// their open iqama renewal is cancelled — there is nobody left to renew for.
// Employees publishes the fact and knows nothing of procedures; GRO already
// depends on Employees, so this is the same one-way direction as the
// employee-terminated handler beside it.
@Injectable()
export class DependantRemovedHandler {
  private readonly logger = new Logger(DependantRemovedHandler.name);

  constructor(private readonly processes: GroProcessesService) {}

  @OnEvent(DependantRemovedEvent.NAME)
  async handle(event: DependantRemovedEvent): Promise<void> {
    const cancelled = await this.processes.cancelForDependant(event.dependantId);
    if (cancelled) this.logger.log(`Cancelled ${cancelled} renewal(s) of a removed dependant`);
  }
}
