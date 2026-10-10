import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { VOID_REASON_STEP_REOPENED } from '@hr/contracts';
import { SequenceStepReopenedEvent } from '../../gro/public-api';
import { FeesService } from './fees.service';

// Billing subscribes to "a sequence step was reopened" (BILL-02, ADR-020; the
// ADR-004 pattern): the fee recorded for that step is VOIDED — it paid for a
// filing that no longer stands. A fee already on an invoice is LEFT: the client
// has been billed for it, and that is corrected in the accounting system, not
// by quietly removing a line here.
//
// GRO publishes the fact and knows nothing of fees; Billing already reads GRO,
// so this is the same one-way direction. It runs inside the reopening request,
// so the void is audited as the person who reopened the step.
@Injectable()
export class StepReopenedHandler {
  private readonly logger = new Logger(StepReopenedHandler.name);

  constructor(private readonly fees: FeesService) {}

  @OnEvent(SequenceStepReopenedEvent.NAME)
  async handle(event: SequenceStepReopenedEvent): Promise<void> {
    const outcome = await this.fees.voidForReopenedStep(
      event.sequenceId,
      event.stepKey,
      VOID_REASON_STEP_REOPENED,
    );
    if (outcome === 'voided') {
      this.logger.log(`Voided the fee of reopened step ${event.stepKey} (${event.sequenceId})`);
    } else if (outcome === 'invoiced') {
      this.logger.log(
        `Step ${event.stepKey} (${event.sequenceId}) was reopened; its fee is on an invoice and stays`,
      );
    }
  }
}
