'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { NotificationPreferencesResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CATEGORIES = ['document_expiry', 'task', 'request', 'general', 'system'] as const;

// Notification preferences (NOTIF-06) — a settings section over the NOTIF-04
// GET/PATCH surface. Per-category EMAIL toggles; in-app notifications are always
// on (stated, not toggleable). Reuses the flags-section badge+button pattern
// (no Base UI switch primitive here).
export function NotificationPreferences() {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [email, setEmail] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch<NotificationPreferencesResponse>('/notifications/preferences');
      setEmail(res.email);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(category: string, next: boolean) {
    setBusy(category);
    try {
      const res = await apiFetch<NotificationPreferencesResponse>(
        `/notifications/preferences/${category}`,
        { method: 'PATCH', body: JSON.stringify({ emailEnabled: next }) },
      );
      setEmail(res.email);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{t('prefsTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('prefsSubtitle')}</p>
        {CATEGORIES.map((c) => {
          const on = email?.[c] ?? true;
          return (
            <div
              key={c}
              className="flex items-center justify-between gap-4 border-b pb-3 last:border-0"
            >
              <div className="text-sm font-medium">{t(`category.${c}`)}</div>
              <div className="flex items-center gap-3">
                <Badge variant={on ? 'default' : 'secondary'}>
                  {t('emailLabel')}: {on ? t('on') : t('off')}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === c || !email}
                  onClick={() => void toggle(c, !on)}
                >
                  {on ? t('disable') : t('enable')}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
