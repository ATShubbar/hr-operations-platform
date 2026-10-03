'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  DownloadResponse,
  SelfDocumentListResponse,
  SelfDocumentResponse,
  SelfProfileResponse,
  SelfRequestListResponse,
} from '@hr/contracts';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import {
  CONTRACT_TYPE_KEY,
  EXIT_REENTRY_KEY,
  GOSI_REG_KEY,
  dualDate,
  type Locale,
} from '@/lib/employee-format';
import { EXPIRY_TONE, expirySeverity } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { RaiseRequestDialog } from './raise-request-dialog';

const DAY_MS = 86_400_000;

type Loaded = {
  profile: SelfProfileResponse;
  documents: SelfDocumentResponse[];
  openRequests: number;
};

// "My file" (SS-07) — the employee's own record, the prototype's isMe screen,
// built PHONE-FIRST: one column at 375px, two only where a field list has room.
// Everything comes from the /me* API (SS-03/04/05), already fenced to this one
// employee by the database; this page only arranges it.
export default function MyFilePage() {
  const t = useTranslations('me');
  const tEmp = useTranslations('employees');
  const tDoc = useTranslations('documents');
  const tStates = useTranslations('states');
  const locale = useLocale() as Locale;

  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [profile, docs, reqs] = await Promise.all([
        apiFetch<SelfProfileResponse>('/me'),
        apiFetch<SelfDocumentListResponse>('/me/documents'),
        apiFetch<SelfRequestListResponse>('/me/requests'),
      ]);
      setData({
        profile,
        documents: docs.documents,
        openRequests: reqs.requests.filter((r) => r.status === 'open' || r.status === 'in_progress')
          .length,
      });
      setState('ready');
    } catch (err) {
      // 403 = the employer has not switched self-service on (or the record is
      // terminated) — a state to explain calmly, not an error to retry.
      setState(err instanceof ApiError && err.status === 403 ? 'disabled' : 'error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const name = data ? (locale === 'ar' ? data.profile.name.ar : data.profile.name.en) : null;

  async function download(doc: SelfDocumentResponse) {
    setDownloadError('');
    try {
      const res = await apiFetch<DownloadResponse>(`/me/documents/${doc.id}/download`);
      // A 5-minute presigned link straight to the object store (SS-04).
      window.open(res.url, '_blank', 'noopener');
    } catch {
      setDownloadError(t('downloadFailed'));
    }
  }

  if (state === 'loading') {
    return (
      <SkeletonRegion label={tStates('loading')} className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </SkeletonRegion>
    );
  }
  if (state === 'disabled') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t('myFile')}</h1>
        <EmptyState
          variant="restricted"
          title={t('notEnabledTitle')}
          description={t('notEnabled')}
        />
      </div>
    );
  }
  if (state === 'error' || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t('myFile')}</h1>
        <LoadError onRetry={() => void load()} />
      </div>
    );
  }

  const { profile, documents, openRequests } = data;
  const otherName = locale === 'ar' ? profile.name.en : profile.name.ar;
  const job =
    locale === 'ar'
      ? (profile.jobTitle.ar ?? profile.jobTitle.en)
      : (profile.jobTitle.en ?? profile.jobTitle.ar);
  const company = locale === 'ar' ? profile.company.ar : profile.company.en;
  const joined = dualDate(profile.hireDate, locale);

  const money = (n: number | null) =>
    n == null
      ? null
      : new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
          style: 'currency',
          currency: profile.pay.currency,
          maximumFractionDigits: 2,
        }).format(n);

  const ids = profile.identifiers;
  const identifiers: Array<[string, ReactNode, string | null]> = [
    [tEmp('fieldIqama'), ids.iqamaNumber, dualDate(ids.iqamaExpiry, locale)],
    [tEmp('fieldNationalId'), ids.nationalId, null],
    [tEmp('fieldPassport'), ids.passportNumber, dualDate(ids.passportExpiry, locale)],
    [tEmp('fieldBorder'), ids.borderNumber, null],
    [tEmp('fieldWorkPermit'), ids.workPermitNumber, dualDate(ids.workPermitExpiry, locale)],
    [
      tEmp('fieldGosiRegNo'),
      ids.gosiRegistrationNumber,
      ids.gosiRegistrationStatus
        ? tEmp(GOSI_REG_KEY[ids.gosiRegistrationStatus as keyof typeof GOSI_REG_KEY])
        : null,
    ],
  ].filter(([, value]) => value) as Array<[string, ReactNode, string | null]>;
  if (ids.exitReentryStatus && ids.exitReentryStatus !== 'none') {
    identifiers.push([
      tEmp('fieldExitReentry'),
      tEmp(EXIT_REENTRY_KEY[ids.exitReentryStatus as keyof typeof EXIT_REENTRY_KEY]),
      dualDate(ids.exitReentryExpiry, locale),
    ]);
  }

  const pay: Array<[string, string]> = [
    [tEmp('fieldBasicSalary'), money(profile.pay.basicSalary)],
    [tEmp('fieldHousing'), money(profile.pay.housingAllowance)],
    [tEmp('fieldTransport'), money(profile.pay.transportAllowance)],
    [tEmp('fieldOther'), money(profile.pay.otherAllowances)],
    [tEmp('fieldGosiWage'), money(profile.pay.gosiWage)],
    [tEmp('fieldIban'), profile.pay.bankIbanLast4 ? `•••• ${profile.pay.bankIbanLast4}` : null],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="space-y-6">
      {/* ---- Who ---- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            <bdi>{otherName}</bdi>
          </p>
          <p className="text-sm">
            {[job, company, joined ? t('joined', { date: joined }) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-xs text-muted-foreground">
            {tEmp(CONTRACT_TYPE_KEY[profile.contractType])}
          </p>
        </div>
        <Button onClick={() => setRaiseOpen(true)}>{t('raise')}</Button>
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {/* ---- My documents ---- */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('myDocuments')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('documentsNote')}</p>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noDocuments')}</p>
          ) : (
            <ul className="divide-y">
              {documents.map((d) => {
                const days = d.expiryDate
                  ? Math.floor(
                      (Date.parse(d.expiryDate) -
                        Date.parse(new Date().toISOString().slice(0, 10))) /
                        DAY_MS,
                    )
                  : null;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tDoc(`category.${d.category}`)}
                        {d.expiryDate ? ` · ${dualDate(d.expiryDate, locale)}` : ''}
                      </p>
                    </div>
                    {days !== null && (
                      <StatusPill tone={EXPIRY_TONE[expirySeverity(days)]}>
                        {days < 0 ? t('expired') : t('daysLeft', { days })}
                      </StatusPill>
                    )}
                    <Button variant="outline" size="sm" onClick={() => void download(d)}>
                      {t('download')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {downloadError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {downloadError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---- My identifiers ---- */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('myIdentifiers')}</CardTitle>
          </CardHeader>
          <CardContent>
            {identifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noneOnFile')}</p>
            ) : (
              <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6">
                {identifiers.map(([label, value, sub]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 font-mono text-sm">
                      <bdi dir="ltr">{value}</bdi>
                    </dd>
                    {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* ---- My pay ---- */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('myPay')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pay.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noneOnFile')}</p>
            ) : (
              <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6">
                {pay.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-sm tabular-nums">
                      <bdi dir="ltr">{value}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- My requests (summary) ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{t('myRequests')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('openWithTeam', { count: openRequests })}
          </p>
          <CardAction>
            <Link
              href="/me/requests"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              {t('openRequests')}
            </Link>
          </CardAction>
        </CardHeader>
      </Card>

      <RaiseRequestDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        onRaised={(r) => {
          setNotice(t('raised', { title: r.title }));
          setData((prev) => (prev ? { ...prev, openRequests: prev.openRequests + 1 } : prev));
        }}
      />
    </div>
  );
}
