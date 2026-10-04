'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CarryOverResponse, ClientListResponse, ClientResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { riyadhToday } from '@/lib/leave';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALL = 'all';

// Settings → System → Leave carry-over (LEAVE-05; Administrator, leave.carry-over).
// The 1 January job does this by itself; this repeats it or catches up — for
// every company or one. The server credits nobody twice for the same year, so a
// second run is harmless; the confirmation says so before it runs.
export function LeaveCarryOverSection() {
  const t = useTranslations('leaves.carryOver');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [year, setYear] = useState(String(Number(riyadhToday().slice(0, 4))));
  const [clientId, setClientId] = useState(ALL);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<ClientListResponse>('/clients')
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]));
  }, []);
  const clientName = (c: ClientResponse) => (locale === 'ar' ? c.name.ar : c.name.en);

  async function run() {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return;
    if (!window.confirm(t('confirm', { from: y - 1, year: y }))) return;
    setRunning(true);
    setNotice('');
    setError('');
    try {
      const res = await apiFetch<CarryOverResponse>('/leave/carry-over', {
        method: 'POST',
        body: JSON.stringify({ year: y, ...(clientId === ALL ? {} : { clientId }) }),
      });
      setNotice(
        t('done', {
          year: res.year,
          credited: res.credited,
          already: res.alreadyCredited,
          nothing: res.nothingToCarry,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-pretty text-muted-foreground">{t('subtitle')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-year">{t('year')}</Label>
            <Input
              id="co-year"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-client">{t('company')}</Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? ALL)}>
              <SelectTrigger id="co-client" className="w-56">
                <SelectValue>
                  {(v) => {
                    if (v === ALL) return t('allCompanies');
                    const c = clients.find((x) => x.id === v);
                    return c ? clientName(c) : t('allCompanies');
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('allCompanies')}</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {clientName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void run()} disabled={running || year.length !== 4}>
            {running ? t('running') : t('run')}
          </Button>
        </div>
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
