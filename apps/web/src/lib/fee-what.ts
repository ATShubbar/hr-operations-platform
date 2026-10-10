'use client';

import { useTranslations } from 'next-intl';
import type { FeeResponse } from '@hr/contracts';

// What a fee was FOR, in the viewer's language (BILL-03). A fee recorded by
// hand carries its own words; a step's or a procedure's fee is named by what
// it was filed for. One place, used by the Fees ledger and by the invoice
// records that list the fees they recover (BILL-05).
export function useFeeWhat(): (fee: FeeResponse) => string {
  const tm = useTranslations('person.mob');
  const tg = useTranslations('gro');
  return (f) =>
    f.source.kind === 'manual'
      ? f.source.label
      : f.source.kind === 'sequence_step'
        ? `${tm(`step.${f.source.stepKey}.title`)} · ${tm(`kind.${f.source.sequenceKind}.label`)}`
        : tg(`type.${f.source.procedureType}`);
}
