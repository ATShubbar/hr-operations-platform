'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_STANDARD_FEES,
  MAX_FEE_HALALAS,
  type StandardFees,
} from '@hr/contracts/billing-lists';
import { halalasToInput, sarTextToHalalas } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const STANDARD_FEES_KEY = 'billing.standard-fees';

// Settings → System → Standard fees (BILL-06, ADR-020; Administrator —
// config.write). One amount per procedure type, one per onboarding and
// final-exit step, and the annual fee per dependant.
//
// A standard fee is only what a filing dialog PREFILLS: the person filing still
// confirms what was actually paid, and changing a figure here never alters a
// fee already recorded. The figures the system starts with are the design's —
// not checked against the authorities' current tariffs — so this screen is
// where the Administrator corrects them. Zero means "no fee is expected".
// The API validates the whole set (every key present, strict) and audits the
// change like any system setting.

type Draft = Record<string, string>;
const PROCEDURES = Object.keys(DEFAULT_STANDARD_FEES.procedures);
const ONBOARDING = Object.keys(DEFAULT_STANDARD_FEES.steps.onboarding);
const FINAL_EXIT = Object.keys(DEFAULT_STANDARD_FEES.steps.final_exit);

const key = (group: string, k: string) => `${group}:${k}`;
// Zero is shown as "0", not as an empty box: every figure here is a statement.
const text = (halalas: number | undefined) => halalasToInput(halalas ?? 0) || '0';

function toDraft(v: StandardFees): Draft {
  const d: Draft = { dependant: text(v.dependantAnnual) };
  for (const k of PROCEDURES) d[key('p', k)] = text(v.procedures[k]);
  for (const k of ONBOARDING) d[key('o', k)] = text(v.steps.onboarding[k]);
  for (const k of FINAL_EXIT) d[key('f', k)] = text(v.steps.final_exit[k]);
  return d;
}

/** null when any box does not hold an amount the API would accept. */
function fromDraft(d: Draft): StandardFees | null {
  const amount = (k: string): number | null => {
    const n = sarTextToHalalas(d[k] ?? '');
    return n === null || n > MAX_FEE_HALALAS ? null : n;
  };
  const group = (g: string, keys: string[]): Record<string, number> | null => {
    const out: Record<string, number> = {};
    for (const k of keys) {
      const n = amount(key(g, k));
      if (n === null) return null;
      out[k] = n;
    }
    return out;
  };
  const procedures = group('p', PROCEDURES);
  const onboarding = group('o', ONBOARDING);
  const finalExit = group('f', FINAL_EXIT);
  const dependantAnnual = amount('dependant');
  if (!procedures || !onboarding || !finalExit || dependantAnnual === null) return null;
  return { procedures, steps: { onboarding, final_exit: finalExit }, dependantAnnual };
}

export function StandardFeesSection({
  value,
  busy,
  onSave,
}: {
  value: StandardFees | undefined;
  busy: boolean;
  onSave: (next: StandardFees) => void;
}) {
  const t = useTranslations('settings.standardFees');
  const tg = useTranslations('gro');
  const tm = useTranslations('person.mob');
  const saved = value ?? DEFAULT_STANDARD_FEES;
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  // Re-sync when the saved value changes (after a save reloads the settings).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(toDraft(saved));
  }

  const next = fromDraft(draft);
  const changed =
    next !== null && JSON.stringify(next) !== JSON.stringify(fromDraft(toDraft(saved)));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (next) onSave(next);
  }

  const field = (id: string, label: string) => (
    <div key={id} className="flex flex-col gap-1.5">
      <Label htmlFor={`sf-${id}`} className="text-[13px] leading-[18px] text-pretty">
        {label}
      </Label>
      <Input
        id={`sf-${id}`}
        dir="ltr"
        inputMode="decimal"
        aria-describedby="sf-unit"
        aria-invalid={
          sarTextToHalalas(draft[id] ?? '') === null ||
          (sarTextToHalalas(draft[id] ?? '') ?? 0) > MAX_FEE_HALALAS
        }
        value={draft[id] ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
      />
    </div>
  );
  const group = (legend: string, fields: ReactNode) => (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm leading-5 font-medium">{legend}</legend>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields}</div>
    </fieldset>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-6">
          {group(
            t('group.procedures'),
            PROCEDURES.map((k) => field(key('p', k), tg(`type.${k}`))),
          )}
          {group(
            t('group.onboarding'),
            ONBOARDING.map((k) => field(key('o', k), tm(`step.${k}.title`))),
          )}
          {group(
            t('group.finalExit'),
            FINAL_EXIT.map((k) => field(key('f', k), tm(`step.${k}.title`))),
          )}
          {group(t('group.dependant'), field('dependant', t('dependantLabel')))}
          <div className="flex flex-wrap items-center gap-3">
            <p id="sf-unit" className="grow text-xs leading-4 text-muted-foreground">
              {next ? t('unit') : t('invalid')}
            </p>
            <Button type="submit" size="sm" disabled={busy || !next || !changed}>
              {t('save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
