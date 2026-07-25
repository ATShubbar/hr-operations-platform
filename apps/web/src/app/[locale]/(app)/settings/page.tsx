'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  ConfigCatalogResponse,
  ConfigEffectiveResponse,
  ConfigFlagsResponse,
  ConfigSettingDescriptor,
} from '@hr/contracts';
import { usePathname, useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { NotificationPreferences } from '@/components/notification-preferences';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
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
  // Skeleton and error-state copy lives in one shared namespace: a per-screen
  // `loading` key silently announced "calendar.loading" to screen readers when
  // the namespace happened not to define one (UX-06).
  const tStates = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const canWriteSystem = useCan('config.write');
  // Per-client overrides are Company Admin's (matrix), distinct from the System
  // Admin's system-level config.write.
  const canWriteClient = useCan('config.write-client');

  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [system, setSystem] = useState<Record<string, unknown> | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [tz, setTz] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Per-client overrides (UX-10a). The API has existed since CONF-02 with no way
  // to reach it — enabling a client flag meant writing SQL by hand.
  const [catalog, setCatalog] = useState<ConfigSettingDescriptor[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [clientSettings, setClientSettings] = useState<Record<string, unknown> | null>(null);

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
        setCatalog(cat.settings);
      }
      if (canWriteClient) {
        // The catalog is also needed for the per-client section, and a Company
        // Admin may hold config.write-client without config.write.
        if (!canWriteSystem) {
          const [sys, cat] = await Promise.all([
            apiFetch<ConfigEffectiveResponse>('/config'),
            apiFetch<ConfigCatalogResponse>('/config/catalog'),
          ]);
          setSystem(sys.settings);
          setCatalog(cat.settings);
          setDescriptions(Object.fromEntries(cat.settings.map((s) => [s.key, s.description])));
        }
        const cl = await apiFetch<ClientListResponse>('/clients');
        setClients(cl.clients);
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
  }, [canWriteSystem, canWriteClient]);

  // Effective settings FOR A CLIENT: the API merges system defaults with that
  // client's overrides, so `origin` below is derived by comparing the two.
  const loadClientSettings = useCallback(
    async (clientId: string) => {
      if (!clientId) {
        setClientSettings(null);
        return;
      }
      setError('');
      try {
        const res = await apiFetch<ConfigEffectiveResponse>(`/config/client/${clientId}`);
        setClientSettings(res.settings);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
        setError(t('error'));
      }
    },
    [router, t],
  );

  async function patchClient(key: string, value: unknown) {
    if (!selectedClient) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/config/client/${selectedClient}/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      });
      await loadClientSettings(selectedClient);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function clearClientOverride(key: string) {
    if (!selectedClient) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/config/client/${selectedClient}/${key}`, { method: 'DELETE' });
      await loadClientSettings(selectedClient);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

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

  // Early return, so the error state has to be handled HERE too — otherwise a
  // failed load renders a grey "loading…" forever and the retry below is
  // unreachable (UX-06).
  if (!me) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {error ? (
          <LoadError message={error} onRetry={() => void load()} />
        ) : (
          <SkeletonRegion label={tStates('loading')} className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-lg border bg-card p-6">
                <Skeleton className="mb-4 h-4 w-40" />
                <Skeleton className="mb-2 h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </SkeletonRegion>
        )}
      </div>
    );
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

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={false} />
      )}

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

      {/* ---- Notification preferences (everyone) ---- */}
      <NotificationPreferences />

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

      {/* ---- Per-client overrides (UX-10a, Company Admin) ---- */}
      {canWriteClient && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('clientTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('clientSubtitle')}</p>

            <div className="space-y-1.5">
              <Label>{t('clientPick')}</Label>
              <Select
                value={selectedClient}
                onValueChange={(v) => {
                  const id = v ?? '';
                  setSelectedClient(id);
                  void loadClientSettings(id);
                }}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={t('clientPickPlaceholder')}>
                    {(v) => {
                      const c = clients.find((x) => x.id === v);
                      if (!c) return t('clientPickPlaceholder');
                      return locale === 'ar' ? c.name.ar : c.name.en;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {locale === 'ar' ? c.name.ar : c.name.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClient && clientSettings && (
              <div className="space-y-3">
                {catalog
                  .filter((def) => def.levels.includes('client'))
                  .map((def) => {
                    const clientValue = clientSettings[def.key];
                    const systemValue = system?.[def.key];
                    // The API returns the EFFECTIVE value, not the raw override,
                    // so "overridden" is inferred by comparison. An override set
                    // to the same value as the system default is indistinguish-
                    // able here — showing that honestly would need the API to
                    // return the override set, which is a contract change.
                    const overridden = JSON.stringify(clientValue) !== JSON.stringify(systemValue);
                    const isBool = typeof clientValue === 'boolean';
                    return (
                      <div
                        key={def.key}
                        className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              <bdi dir="ltr">{def.key}</bdi>
                            </span>
                            <StatusPill tone={overridden ? 'info' : 'neutral'}>
                              {overridden ? t('originClient') : t('originSystem')}
                            </StatusPill>
                          </div>
                          <div className="text-xs text-muted-foreground">{def.description}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('effectiveValue')}: <bdi dir="ltr">{JSON.stringify(clientValue)}</bdi>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {/* Booleans get a real control. The other shapes —
                              enums, arrays, timezone strings — have no editor
                              metadata in the catalog (no options, no type), so
                              rendering one would mean re-declaring every shape in
                              the web app. They stay readable, and clearing an
                              override still works. */}
                          {isBool && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => void patchClient(def.key, !clientValue)}
                            >
                              {clientValue ? t('disable') : t('enable')}
                            </Button>
                          )}
                          {overridden && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void clearClientOverride(def.key)}
                            >
                              {t('clearOverride')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
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
