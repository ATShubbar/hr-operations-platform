'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ConfigCatalogResponse,
  ConfigEffectiveResponse,
  ConfigFlagsResponse,
} from '@hr/contracts';
import { usePathname, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Locale = 'ar' | 'en';
const CAL_VALUES = ['hijri', 'gregorian', 'dual'] as const;

// Configuration settings UI (CONF-05) — the first place the three-level
// resolution is user-visible. Everyone manages their own preferences (the
// ui.language control persists to /config/me); System Admins additionally edit
// system-level settings + toggle feature flags. Reads /config/me (self),
// /config + /config/flags + /config/catalog (admin only — config.read).
export default function SettingsPage() {
  const t = useTranslations('settings');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const canWriteSystem = useCan('config.write');

  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [system, setSystem] = useState<Record<string, unknown> | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [tz, setTz] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const mine = await apiFetch<ConfigEffectiveResponse>('/config/me');
      setMe(mine.settings);
      if (canWriteSystem) {
        const [sys, fl, cat] = await Promise.all([
          apiFetch<ConfigEffectiveResponse>('/config'),
          apiFetch<ConfigFlagsResponse>('/config/flags'),
          apiFetch<ConfigCatalogResponse>('/config/catalog'),
        ]);
        setSystem(sys.settings);
        setFlags(fl.flags);
        setTz(String(sys.settings['timezone'] ?? ''));
        setDescriptions(Object.fromEntries(cat.settings.map((s) => [s.key, s.description])));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(t('error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint runs without exhaustive-deps here; reload only on mount.
  }, [canWriteSystem]);

  // Write a system-level setting, then reload (self values inherit from it).
  async function patchSystem(key: string, value: unknown) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/config/system/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  // Set the caller's preferred language: persist to /config/me, then switch the
  // app locale so it applies immediately (this is the language-switch wiring).
  async function setLanguage(value: string) {
    if (value !== 'ar' && value !== 'en') return;
    try {
      await apiFetch('/config/me/ui.language', {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      });
    } catch {
      // Non-fatal: still switch the visible locale.
    }
    router.replace(pathname, { locale: value });
  }

  if (!me) {
    return <p className="text-sm text-muted-foreground">{error || t('loading')}</p>;
  }

  const workingWeek = Array.isArray(me['working.week']) ? (me['working.week'] as number[]) : [];
  const calValue = (v: unknown) =>
    v === 'hijri' ? t('calHijri') : v === 'gregorian' ? t('calGregorian') : t('calDual');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ---- My preferences (everyone) ---- */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('prefsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label>{t('language')}</Label>
            <Select
              value={String(me['ui.language'] ?? locale)}
              onValueChange={(v) => void setLanguage(v ?? 'ar')}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => (v === 'en' ? t('langEn') : t('langAr'))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">{t('langAr')}</SelectItem>
                <SelectItem value="en">{t('langEn')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ---- Applies to you (resolved; everyone) ---- */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('appliesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field label={t('calendarDisplay')} value={calValue(me['calendar.display'])} />
          <Field label={t('timezone')} value={String(me['timezone'] ?? '—')} />
          <Field
            label={t('workingWeek')}
            value={workingWeek.map((d) => t(`days.${d}`)).join(locale === 'ar' ? '، ' : ', ') || '—'}
          />
        </CardContent>
      </Card>

      {/* ---- System settings (System Admin only) ---- */}
      {canWriteSystem && system && (
        <>
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t('systemTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">{t('systemSubtitle')}</p>
              <div className="max-w-xs space-y-1.5">
                <Label>{t('calendarDisplay')}</Label>
                <Select
                  value={String(system['calendar.display'] ?? 'dual')}
                  onValueChange={(v) => void patchSystem('calendar.display', v ?? 'dual')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => calValue(v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CAL_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {calValue(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex max-w-md items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="tz">{t('timezone')}</Label>
                  <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
                </div>
                <Button
                  variant="outline"
                  disabled={busy || tz === String(system['timezone'] ?? '')}
                  onClick={() => void patchSystem('timezone', tz)}
                >
                  {busy ? t('saving') : t('save')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t('flagsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('flagsSubtitle')}</p>
              {Object.entries(flags).map(([key, on]) => (
                <div key={key} className="flex items-center justify-between gap-4 border-b pb-3 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{key.replace('flag.', '')}</div>
                    {descriptions[key] && (
                      <div className="text-xs text-muted-foreground">{descriptions[key]}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={on ? 'default' : 'secondary'}>
                      {on ? t('enabled') : t('disabled')}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void patchSystem(key, !on)}
                    >
                      {on ? t('disable') : t('enable')}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
