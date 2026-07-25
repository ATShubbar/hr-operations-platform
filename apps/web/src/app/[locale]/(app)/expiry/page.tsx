'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  DocumentListResponse,
  DocumentResponse,
  ExpiryScanResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonRegion, SkeletonRows } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CATEGORIES = [
  'iqama',
  'passport',
  'visa',
  'contract',
  'gosi',
  'national_id',
  'cv',
  'other',
] as const;
const ALL = 'all';
const HORIZON_DAYS = 60;

// UX-02: four buckets, but THREE visual severities. `expired` and `d7` were both
// `destructive`, so an already-expired document looked identical to one due in a
// week — the two states that most need telling apart. The 30/60-day buckets are
// awareness-only for most staff, so they get no colour at all; spending a hue on
// something nobody will action today is what turns a dashboard into a wall of
// colour and trains people to stop reading it.
type Bucket = 'expired' | 'd7' | 'd30' | 'd60';
const BUCKETS: Bucket[] = ['expired', 'd7', 'd30', 'd60'];
const BUCKET_TONE: Record<Bucket, StatusTone> = {
  expired: 'critical',
  d7: 'warning',
  d30: 'neutral',
  d60: 'neutral',
};

// Whole days from today (local midnight) to an ISO date; negative = overdue.
function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function bucketOf(days: number): Bucket {
  if (days < 0) return 'expired';
  if (days <= 7) return 'd7';
  if (days <= 30) return 'd30';
  return 'd60';
}

function isoHorizon(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + HORIZON_DAYS);
  return d.toISOString().slice(0, 10);
}

// Document-expiry dashboard (EXP-03). A read-only monitoring view over the
// document.read API: everything expiring within 60 days (or already expired),
// grouped by urgency. Admins (expiry.run) get a "run scan now" button that
// triggers POST /expiry/scan and surfaces its summary. The engine also runs the
// same scan on a daily schedule (EXP-02); this is the human-facing companion.
export default function ExpiryPage() {
  const t = useTranslations('expiry');
  // Skeleton and error-state copy lives in one shared namespace: a per-screen
  // `loading` key silently announced "calendar.loading" to screen readers when
  // the namespace happened not to define one (UX-06).
  const tStates = useTranslations('states');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canScan = useCan('expiry.run');

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');

  const [fClient, setFClient] = useState(ALL);
  const [fCategory, setFCategory] = useState(ALL);

  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : id.slice(0, 8);
  };

  async function loadClients() {
    try {
      const res = await apiFetch<ClientListResponse>('/clients');
      setClients(res.clients);
    } catch {
      setClients([]);
    }
  }

  async function load(filters?: { client: string; category: string }) {
    const f = filters ?? { client: fClient, category: fCategory };
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ expiringBefore: isoHorizon() });
      if (f.client !== ALL) params.set('clientId', f.client);
      if (f.category !== ALL) params.set('category', f.category);
      const res = await apiFetch<DocumentListResponse>(`/documents?${params.toString()}`);
      setDocuments(res.documents);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadClients();
  }, []);

  const onApply = (e: FormEvent) => {
    e.preventDefault();
    void load();
  };
  const onClear = () => {
    setFClient(ALL);
    setFCategory(ALL);
    void load({ client: ALL, category: ALL });
  };

  async function runScan() {
    setScanning(true);
    setScanNotice('');
    setError('');
    try {
      const res = await apiFetch<ExpiryScanResponse>('/expiry/scan', { method: 'POST' });
      setScanNotice(
        t('scanDone', {
          scanned: res.scanned,
          alerts: res.alertsRaised,
          notifications: res.notificationsSent,
        }),
      );
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(t('scanError'));
    } finally {
      setScanning(false);
    }
  }

  // Only documents that carry an expiry date reach here (the API filter is on
  // expiry_date); group them by urgency, soonest first within each bucket.
  const grouped = useMemo(() => {
    const out: Record<Bucket, Array<{ doc: DocumentResponse; days: number }>> = {
      expired: [],
      d7: [],
      d30: [],
      d60: [],
    };
    for (const doc of documents) {
      if (!doc.expiryDate) continue;
      const days = daysUntil(doc.expiryDate);
      out[bucketOf(days)].push({ doc, days });
    }
    for (const b of BUCKETS) out[b].sort((a, z) => a.days - z.days);
    return out;
  }, [documents]);

  const total = documents.filter((d) => d.expiryDate).length;

  const daysLabel = (days: number) => {
    if (days < 0) return t('daysOverdue', { n: -days });
    if (days === 0) return t('dueToday');
    return t('daysLeft', { n: days });
  };

  // Deep-linked without the capability: the nav hides the link, a pasted URL does
  // not. A refusal is not a failure, so it replaces the screen and offers no retry.
  if (forbidden) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <NoAccess capability="document.read" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canScan && (
          <Button onClick={() => void runScan()} disabled={scanning}>
            {scanning ? t('running') : t('runScan')}
          </Button>
        )}
      </div>

      {/* summary counts per bucket */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border p-4">
            <div className="text-2xl font-semibold">{grouped[b].length}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t(`bucket.${b}`)}</div>
          </div>
        ))}
      </div>

      <form onSubmit={onApply} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>{t('filterClient')}</Label>
          <Select value={fClient} onValueChange={(v) => setFClient(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue>{(v) => (v === ALL ? t('filterAll') : clientName(String(v)))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filterAll')}</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {locale === 'ar' ? c.name.ar : c.name.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('filterCategory')}</Label>
          <Select value={fCategory} onValueChange={(v) => setFCategory(v ?? ALL)}>
            <SelectTrigger className="w-40">
              <SelectValue>{(v) => (v === ALL ? t('filterAll') : t(`category.${String(v)}`))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filterAll')}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`category.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={loading}>
          {t('apply')}
        </Button>
        <Button type="button" variant="outline" onClick={onClear} disabled={loading}>
          {t('clear')}
        </Button>
      </form>

      {scanNotice && <p className="text-sm text-muted-foreground">{scanNotice}</p>}
      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={documents.length > 0} />
      )}

      {loading && documents.length === 0 ? (
        <SkeletonRegion label={tStates('loading')} className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="mb-3 h-3 w-32" />
              <SkeletonRows rows={2} columns={4} />
            </div>
          ))}
        </SkeletonRegion>
      ) : total === 0 ? (
        <EmptyState variant="first-run" title={t('empty')} />
      ) : (
        BUCKETS.filter((b) => grouped[b].length > 0).map((b) => (
          <section key={b} className="space-y-2" aria-labelledby={`bucket-${b}`}>
            {/* A real heading (UX-11): these severity buckets are the structure
                of the page, and they were <div>s — nothing to navigate by. */}
            <h2 id={`bucket-${b}`} className="flex items-center gap-2">
              <StatusPill tone={BUCKET_TONE[b]}>{t(`bucket.${b}`)}</StatusPill>
              <span className="text-sm text-muted-foreground">{grouped[b].length}</span>
            </h2>
            <div className="rounded-lg border">
              {/* The scroll container lives inside <Table>, so the keyboard fix
                  and the accessible name go THERE, not on this border wrapper —
                  putting tabIndex here would produce a focus stop that scrolls
                  nothing. */}
              <Table labelledBy={`bucket-${b}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colTitle')}</TableHead>
                    <TableHead>{t('colCategory')}</TableHead>
                    <TableHead>{t('colClient')}</TableHead>
                    <TableHead>{t('colExpiry')}</TableHead>
                    <TableHead className="text-end">{t('colDays')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped[b].map(({ doc, days }) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell>{t(`category.${doc.category}`)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {clientName(doc.clientId)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {dualDate(doc.expiryDate, locale)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-end text-sm">
                        {daysLabel(days)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
