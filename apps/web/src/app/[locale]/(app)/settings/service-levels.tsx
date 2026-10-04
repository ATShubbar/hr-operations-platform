'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { RequestType } from '@hr/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const TYPES: readonly RequestType[] = [
  'letter',
  'certificate',
  'document',
  'gro_service',
  'general',
];
export const SERVICE_LEVEL_KEY = 'request.service-level-days';

// Settings → System → Service levels (THREAD-04, Administrator — config.write).
// The turnaround per request type, in WORKING days of each company's week. It
// sets the due date of requests raised from now on (a request keeps the date it
// was given); the clock pauses while a request waits on its requester. The API
// validates (every type, 1–60) and audits the change like any system setting.
export function ServiceLevelsSection({
  value,
  busy,
  onSave,
}: {
  value: Partial<Record<RequestType, number>> | undefined;
  busy: boolean;
  onSave: (next: Record<RequestType, number>) => void;
}) {
  const t = useTranslations('settings.serviceLevels');
  const tr = useTranslations('requests');
  const initial = () =>
    Object.fromEntries(TYPES.map((k) => [k, String(value?.[k] ?? '')])) as Record<
      RequestType,
      string
    >;
  const [draft, setDraft] = useState(initial);
  // Re-sync when the saved value changes (after a save reloads the settings).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(initial());
  }

  const parsed = TYPES.map((k) => Number(draft[k]));
  const valid = parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 60);
  const changed = TYPES.some((k) => Number(draft[k]) !== value?.[k]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSave(
      Object.fromEntries(TYPES.map((k) => [k, Number(draft[k])])) as Record<RequestType, number>,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {TYPES.map((k) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`sla-${k}`}>{tr(`type.${k}`)}</Label>
                <Input
                  id={`sla-${k}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  value={draft[k]}
                  aria-describedby="sla-unit"
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p id="sla-unit" className="grow text-xs leading-4 text-muted-foreground">
              {valid ? t('unit') : t('invalid')}
            </p>
            <Button type="submit" size="sm" disabled={busy || !valid || !changed}>
              {t('save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
