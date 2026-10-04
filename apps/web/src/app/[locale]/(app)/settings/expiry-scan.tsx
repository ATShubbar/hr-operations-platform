'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ExpiryScanResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Settings → System → Document expiry (DS-22a). The retired /expiry dashboard's
// one action: run the expiry scan now (POST /expiry/scan, expiry.run — the
// Administrator), instead of waiting for the daily 06:00 run (EXP-02). The scan
// is idempotent per document and threshold (exp_alerts), so running it twice
// raises nothing new. What is expiring is on the Overview's runway (DS-17).
export function ExpiryScanSection() {
  const t = useTranslations('expiry');
  const ts = useTranslations('settings');
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function runScan() {
    setScanning(true);
    setNotice('');
    setError('');
    try {
      const res = await apiFetch<ExpiryScanResponse>('/expiry/scan', { method: 'POST' });
      setNotice(
        t('scanDone', {
          scanned: res.scanned,
          alerts: res.alertsRaised,
          notifications: res.notificationsSent,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('scanError'));
    } finally {
      setScanning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{ts('scanTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{ts('scanSubtitle')}</p>
        <Button variant="outline" onClick={() => void runScan()} disabled={scanning}>
          {scanning ? t('running') : t('runScan')}
        </Button>
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
