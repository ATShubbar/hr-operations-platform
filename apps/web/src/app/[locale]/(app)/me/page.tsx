'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { formatHijri } from '@hr/dates';
import { chipClass, daysTo } from '@/lib/employee-docs';
import { EXIT_REENTRY_KEY, GOSI_REG_KEY, type Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { RaiseRequestDialog } from './raise-request-dialog';

type Loaded = {
  profile: SelfProfileResponse;
  documents: SelfDocumentResponse[];
  openRequests: number;
};

// "My file" (SS-07; DS-20 brought it to the prototype's layout) — the employee's
// own record, the prototype's isMe screen, built PHONE-FIRST: one column at
// 375px, two only where a field list has room.
// Everything comes from the /me* API (SS-03/04/05), already fenced to this one
// employee by the database; this page only arranges it.
export default function MyFilePage() {
  const t = useTranslations('me');
  const tEmp = useTranslations('employees');
  const tDoc = useTranslations('documents');
  const tPeople = useTranslations('people');
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
        openRequests: reqs.requests.filter((r) =>
          ['open', 'in_progress', 'info_needed'].includes(r.status),
        ).length,
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

  // The prototype's "11 Aug 2026": day, three-letter month, year (en-GB would
  // print "Sept"); Arabic uses its own month names in the same order.
  const shortDate = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };
  const chipText = (days: number) =>
    days < 0 ? tPeople('over', { n: Math.abs(days) }) : tPeople('left', { n: days });

  const money = (n: number | null) =>
    n == null
      ? null
      : new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
          style: 'currency',
          currency: profile.pay.currency,
          maximumFractionDigits: 2,
        }).format(n);

  // ---- My documents: one row per document TYPE (DS-20) ----
  // The prototype's rows are the person's documents by type, dated from the
  // RECORD — the DS-07 rule on the staff side: the record's date is the
  // authority, the file is the matching available document (the one valid
  // longest). Uploaded files that match no type keep a row of their own, so
  // nothing an employee could download before is lost.
  const ids = profile.identifiers;
  const saudi = profile.nationality.toUpperCase() === 'SA';
  const usedFiles = new Set<string>();
  const fileFor = (categories: readonly string[]) => {
    const f =
      documents
        .filter((d) => categories.includes(d.category))
        .sort((a, b) => (b.expiryDate ?? '').localeCompare(a.expiryDate ?? ''))[0] ?? null;
    if (f) usedFiles.add(f.id);
    return f;
  };
  const typeRows = (
    [
      ['iqama', saudi ? null : ids.iqamaExpiry, ['iqama', 'national_id']],
      ['permit', saudi ? null : ids.workPermitExpiry, []],
      ['contract', profile.contractEndDate, ['contract']],
      ['passport', ids.passportExpiry, ['passport']],
    ] as const
  )
    .map(([key, recordIso, categories]) => {
      const file = fileFor(categories);
      const iso = recordIso ?? file?.expiryDate ?? null;
      return { key, label: tPeople(`doc.${key}`), iso, file };
    })
    .filter((r) => r.iso || r.file);
  const otherRows = documents
    .filter((d) => !usedFiles.has(d.id))
    .map((d) => ({
      key: d.id,
      label: d.title || tDoc(`category.${d.category}`),
      iso: d.expiryDate,
      file: d,
    }));
  const docRows = [...typeRows, ...otherRows];

  const identifiers: Array<[string, string]> = [
    [tEmp('fieldIqama'), ids.iqamaNumber],
    [tEmp('fieldNationalId'), ids.nationalId],
    [tEmp('fieldPassport'), ids.passportNumber],
    [tEmp('fieldBorder'), ids.borderNumber],
    [tEmp('fieldWorkPermit'), ids.workPermitNumber],
    [tEmp('fieldGosiRegNo'), ids.gosiRegistrationNumber],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  if (ids.gosiRegistrationStatus) {
    identifiers.push([
      t('gosiStatus'),
      tEmp(GOSI_REG_KEY[ids.gosiRegistrationStatus as keyof typeof GOSI_REG_KEY]),
    ]);
  }
  if (ids.exitReentryStatus && ids.exitReentryStatus !== 'none') {
    identifiers.push([
      tEmp('fieldExitReentry'),
      [
        tEmp(EXIT_REENTRY_KEY[ids.exitReentryStatus as keyof typeof EXIT_REENTRY_KEY]),
        ids.exitReentryExpiry ? shortDate(ids.exitReentryExpiry) : null,
      ]
        .filter(Boolean)
        .join(' · '),
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

  const factList = (rows: Array<[string, string]>, mono: boolean) =>
    rows.length === 0 ? (
      <p className="text-[13px] text-muted-foreground">{t('noneOnFile')}</p>
    ) : (
      <dl className="flex flex-col gap-[9px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="grow text-xs leading-4 text-muted-foreground">{label}</dt>
            <dd className={cn('text-end text-xs', mono && 'font-mono')}>
              <bdi dir={mono ? 'ltr' : undefined}>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    );

  return (
    <div className="flex max-w-[1000px] flex-col gap-4">
      {/* ---- Who ---- */}
      <div className="flex flex-wrap items-start gap-4 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10">
        <Avatar name={profile.name.en} size="lg" />
        <div className="flex min-w-0 grow basis-48 flex-col gap-[3px]">
          <h1 className="text-[22px] leading-[30px] font-semibold tracking-[-0.01em]">{name}</h1>
          <span
            dir={locale === 'ar' ? 'ltr' : 'rtl'}
            className="w-fit text-[13px] leading-[18px] text-muted-foreground"
          >
            {otherName}
          </span>
          <span className="text-[13px] leading-[18px] text-neutral-700">
            {[
              job,
              company,
              profile.hireDate ? t('joined', { date: shortDate(profile.hireDate) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setRaiseOpen(true)}>
          {t('raise')}
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {/* ---- My documents ---- */}
      <section
        aria-labelledby="me-docs"
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <h2 id="me-docs" className="text-base leading-6 font-medium">
            {t('myDocuments')}
          </h2>
          <p className="text-[13px] leading-[18px] text-muted-foreground">{t('documentsNote')}</p>
        </div>
        {docRows.length === 0 ? (
          <p className="border-t px-5 py-6 text-[13px] text-muted-foreground">{t('noDocuments')}</p>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[13px] leading-[18px]">
            <thead>
              <tr className="bg-neutral-100 text-xs leading-4 text-muted-foreground">
                <th scope="col" className="border-t px-3 py-2 text-start sm:px-5 font-medium">
                  {t('colDocument')}
                </th>
                <th
                  scope="col"
                  className="w-px border-t px-2.5 py-2 sm:px-4 text-end font-medium whitespace-nowrap"
                >
                  {t('colExpires')}
                </th>
                <th
                  scope="col"
                  className="w-px border-t px-2.5 py-2 sm:px-4 text-end font-medium whitespace-nowrap"
                >
                  {t('colLeft')}
                </th>
              </tr>
            </thead>
            <tbody>
              {docRows.map((r) => {
                const days = r.iso ? daysTo(r.iso) : null;
                return (
                  <tr key={r.key} className="h-[52px] [&>td]:border-t">
                    <td className="px-3 py-1.5 sm:px-5">
                      <span className="block text-sm leading-5 break-words">{r.label}</span>
                      {r.file && (
                        <button
                          type="button"
                          onClick={() => void download(r.file!)}
                          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          {t('download')}
                        </button>
                      )}
                    </td>
                    <td className="px-2.5 text-end whitespace-nowrap sm:px-4">
                      {r.iso ? (
                        <span className="flex flex-col items-end">
                          <span>{shortDate(r.iso)}</span>
                          <span className="text-[10px] leading-[14px] text-neutral-400">
                            {formatHijri(new Date(r.iso), locale)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-2.5 text-end sm:px-4">
                      {days !== null && (
                        <span
                          className={cn(
                            'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                            chipClass(days),
                          )}
                        >
                          {chipText(days)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {downloadError && (
          <p role="alert" className="border-t px-5 py-2 text-sm text-destructive">
            {downloadError}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* ---- My identifiers ---- */}
        <section
          aria-labelledby="me-ids"
          className="flex flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
        >
          <h2 id="me-ids" className="text-base leading-6 font-medium">
            {t('myIdentifiers')}
          </h2>
          {factList(identifiers, true)}
        </section>

        {/* ---- My pay ---- */}
        <section
          aria-labelledby="me-pay"
          className="flex flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
        >
          <h2 id="me-pay" className="text-base leading-6 font-medium">
            {t('myPay')}
          </h2>
          {factList(pay, true)}
        </section>
      </div>

      {/* ---- My requests (summary) ---- */}
      <section
        aria-labelledby="me-reqs"
        className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-5 py-3.5 ring-1 ring-foreground/10"
      >
        <span className="flex min-w-0 grow flex-col gap-px">
          <h2 id="me-reqs" className="text-sm leading-5 font-medium">
            {t('myRequests')}
          </h2>
          <span className="text-xs leading-4 text-muted-foreground">
            {t('openWithTeam', { count: openRequests })}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          nativeButton={false}
          render={<Link href="/me/requests" />}
        >
          {t('openRequests')}
        </Button>
      </section>

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
