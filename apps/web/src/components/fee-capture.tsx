'use client';

import { useTranslations } from 'next-intl';
import { receiptProblem } from '@/lib/fees';
import { sarTextToHalalas, useMoney } from '@/lib/money';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// "What was paid?" (BILL-02, ADR-020) — the two fields every dialog that can
// record a government fee shares: the amount actually paid, prefilled with the
// standard fee, and an optional receipt.
//
// The standard fee is only a starting figure. The person confirms or corrects
// it; an empty box (or 0) records NO fee, and the help text says so. The amount
// is typed in riyals and held as text until it is used, so "9,700.5" is never
// rounded behind the person's back.

export interface FeeCaptureValue {
  amount: string;
  receipt: File | null;
}

/** The message key for what is wrong with these fields, or null. */
export function feeCaptureProblem(
  value: FeeCaptureValue,
): 'amount' | 'fileType' | 'fileSize' | null {
  if (sarTextToHalalas(value.amount) === null) return 'amount';
  const file = receiptProblem(value.receipt);
  if (file === 'type') return 'fileType';
  if (file === 'size') return 'fileSize';
  return null;
}

export function FeeCapture({
  id,
  value,
  onChange,
  standardHalalas,
}: {
  /** Prefix for the inputs' ids — unique per dialog. */
  id: string;
  value: FeeCaptureValue;
  onChange: (next: FeeCaptureValue) => void;
  /** The standard fee for this filing; 0 = none. */
  standardHalalas: number;
}) {
  const t = useTranslations('fees');
  const money = useMoney();
  const halalas = sarTextToHalalas(value.amount);

  return (
    <div className="flex flex-col gap-3 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-amount`}>{t('amountPaid')}</Label>
        <Input
          id={`${id}-amount`}
          dir="ltr"
          inputMode="decimal"
          placeholder="0"
          value={value.amount}
          aria-describedby={`${id}-amount-help`}
          aria-invalid={halalas === null || undefined}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          className="bg-card font-mono"
        />
        <p id={`${id}-amount-help`} className="text-xs leading-4 text-muted-foreground">
          {standardHalalas > 0
            ? t('amountHelp', { standard: money(standardHalalas) })
            : t('amountHelpNone')}{' '}
          {/* An amount that cannot be read is neither a fee nor "nothing": say
              neither, and let the error below the fields speak. */}
          {halalas === null
            ? null
            : halalas > 0
              ? t('willRecord', { amount: money(halalas) })
              : t('willRecordNothing')}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-receipt`}>{t('receipt')}</Label>
        <input
          id={`${id}-receipt`}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          // A receipt belongs to a fee: with nothing to record there is none to attach.
          disabled={!halalas}
          onChange={(e) => onChange({ ...value, receipt: e.target.files?.[0] ?? null })}
          className="block w-full min-w-0 text-[13px] file:me-3 file:rounded-md file:border-0 file:bg-card file:px-2.5 file:py-1.5 file:text-[13px] file:font-medium file:ring-1 file:ring-foreground/15 disabled:opacity-50"
        />
        <p className="text-xs leading-4 text-muted-foreground">{t('receiptHelp')}</p>
      </div>
    </div>
  );
}
