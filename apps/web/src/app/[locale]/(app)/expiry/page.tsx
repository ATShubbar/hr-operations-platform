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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

type Bucket = 'expired' | 'd7' | 'd30' | 'd60';
const BUCKETS: Bucket[] = ['expired', 'd7', 'd30', 'd60'];
const BADGE: Record<Bucket, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  expired: 'destructive',
  d7: 'destructive',
  d30: 'default',
  d60: 'secondary',
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
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canScan = useCan('expiry.run');

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
      setError(t('error'));
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
      {error && <p className="text-sm text-destructive">{error}</p>}

      {total === 0 && !loading ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        BUCKETS.filter((b) => grouped[b].length > 0).map((b) => (
          <section key={b} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={BADGE[b]}>{t(`bucket.${b}`)}</Badge>
              <span className="text-sm text-muted-foreground">{grouped[b].length}</span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
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
