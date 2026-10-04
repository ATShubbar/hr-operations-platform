'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EmployeeResponse, GroProcessListResponse, GroProcessResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { GRO_ACTIVE, GroWorkRows, byDue } from '@/components/gro-work-list';

// The Person record's Open work tab (DS-07) — the prototype's list of what is
// still open on this person, soonest first, each with a due date (and its Hijri
// day) and a way to move it on.
//
// Government procedures are listed for real (GET /gro-processes?employeeId=);
// the rows and their Resolve control are shared with the Client record's Open
// work tab (components/gro-work-list.tsx, DS-11). Requests and internal tasks do
// not record which employee they concern, so they cannot be listed per person
// yet — said in a note, not faked (owner decision).

export function OpenWorkTab({
  emp,
  onEmployeeChanged,
}: {
  emp: EmployeeResponse;
  /** Completing an expiry-bearing process changes the employee's record. */
  onEmployeeChanged: () => void;
}) {
  const t = useTranslations('person.work');
  const router = useRouter();
  const [items, setItems] = useState<GroProcessResponse[] | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiFetch<GroProcessListResponse>(`/gro-processes?employeeId=${emp.id}`);
      setItems(res.processes.filter((p) => GRO_ACTIVE.has(p.status)).sort(byDue));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setItems([]);
      setError(t('error'));
    }
  }
  useEffect(() => {
    void load();
  }, [emp.id]);

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {error && (
        <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {items !== null && items.length === 0 && (
        <div className="px-6 py-12 text-center text-sm leading-5 text-muted-foreground">
          {t('empty')}
        </div>
      )}
      {items && (
        <GroWorkRows items={items} onChanged={load} onEmployeeChanged={onEmployeeChanged} />
      )}
      <p className="bg-neutral-50 px-4 py-2.5 text-xs leading-4 text-muted-foreground">
        {t('soonNote')}
      </p>
    </div>
  );
}
