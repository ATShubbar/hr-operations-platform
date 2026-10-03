'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Eye, FileText } from 'lucide-react';
import type {
  DocumentCategory,
  DocumentListResponse,
  DocumentResponse,
  EmployeeResponse,
  UploadIssueResponse,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/toast';

// The Person record's Documents tab (DS-07) — the prototype's "Documents on file"
// table: one row per document type, its scanned file, its expiry with the days-
// left chip, View / Download, and Renew inside 90 days of expiry.
//
// Two stores meet here, as they do in the business: the expiry DATE lives on the
// employee record (government data, or the contract end on the core record), and
// the scanned FILE lives in the documents registry (DOC-01..05). A row is the
// type; its date comes from the record and its file is the newest available
// registry document of a matching category. Renewing writes the new date where it
// lives — the same endpoints the Profile tab edits through.
//
// Work permits have no registry category, so their file column reads "No file".
// Medical insurance and driving licence are not stored at all yet: shown, "Not
// stored yet", with no actions. The prototype's renewal reference number has no
// field to live in, so it is not offered (DS-07 evidence).

type Group = 'core' | 'gov';
type RowKey = 'iqama' | 'permit' | 'contract' | 'passport' | 'insurance' | 'licence';

interface RowDef {
  key: RowKey;
  categories: DocumentCategory[];
  cycleMonths?: number;
  /** Where the expiry lives; absent = not stored yet. */
  field?: { group: Group; key: string; read: (e: EmployeeResponse) => string | null };
}

const ROWS: RowDef[] = [
  {
    key: 'iqama',
    categories: ['iqama', 'national_id'],
    cycleMonths: 12,
    field: { group: 'gov', key: 'iqamaExpiry', read: (e) => e.govdata?.iqamaExpiry ?? null },
  },
  {
    key: 'permit',
    categories: [],
    cycleMonths: 12,
    field: {
      group: 'gov',
      key: 'workPermitExpiry',
      read: (e) => e.govdata?.workPermitExpiry ?? null,
    },
  },
  {
    key: 'contract',
    categories: ['contract'],
    cycleMonths: 36,
    field: { group: 'core', key: 'contractEndDate', read: (e) => e.contractEndDate },
  },
  {
    key: 'passport',
    categories: ['passport'],
    cycleMonths: 60,
    field: { group: 'gov', key: 'passportExpiry', read: (e) => e.govdata?.passportExpiry ?? null },
  },
  { key: 'insurance', categories: [] },
  { key: 'licence', categories: [] },
];

const CATEGORIES: DocumentCategory[] = [
  'iqama',
  'passport',
  'visa',
  'contract',
  'gosi',
  'national_id',
  'cv',
  'other',
];

function daysTo(iso: string): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}
const todayIso = () => new Date().toISOString().slice(0, 10);
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
// The prototype's chip scale (shared with the People list).
function chipClass(days: number): string {
  if (days <= 7) return 'bg-status-critical-surface text-status-critical';
  if (days <= 14) return 'bg-status-warning-surface text-status-warning';
  if (days <= 30) return 'bg-neutral-100 text-neutral-700';
  return 'bg-transparent text-neutral-400';
}
function size(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function kind(doc: DocumentResponse): string {
  const ext = doc.fileName.includes('.') ? doc.fileName.split('.').pop()! : '';
  return (ext || doc.contentType.split('/').pop() || 'file').toUpperCase();
}

export function DocumentsTab({
  emp,
  clientName,
  onSaved,
}: {
  emp: EmployeeResponse;
  clientName: string;
  onSaved: (e: EmployeeResponse) => void;
}) {
  const t = useTranslations('person.docs');
  const tp = useTranslations('people');
  const tc = useTranslations('documents.category');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canUpload = useCan('document.upload');
  const canWrite: Record<Group, boolean> = {
    core: useCan('employee.update'),
    gov: useCan('govdata.update'),
  };

  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [error, setError] = useState('');
  // Renewals recorded in this session — the record keeps the new date, not the
  // act, so "Renewed …" is shown for what was done here (as in the prototype).
  const [renewed, setRenewed] = useState<Partial<Record<RowKey, string>>>({});

  async function loadDocs() {
    try {
      const res = await apiFetch<DocumentListResponse>(`/documents?employeeId=${emp.id}`);
      setDocs(res.documents);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setDocs([]);
    }
  }
  useEffect(() => {
    void loadDocs();
  }, [emp.id]);

  const saudi = emp.nationality.toUpperCase() === 'SA';
  const day = (iso: string) => {
    const d = new Date(iso);
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
  const hijri = (iso: string) => formatHijri(new Date(iso), locale);
  const chipText = (days: number) =>
    days < 0 ? tp('over', { n: Math.abs(days) }) : tp('left', { n: days });

  const rows = ROWS.map((r) => {
    // A Saudi has a national ID (no expiry) instead of an iqama, and no permit.
    const notApplicable = saudi && (r.key === 'iqama' || r.key === 'permit');
    const label = saudi && r.key === 'iqama' ? t('label.nationalId') : tp(`doc.${r.key}`);
    const issuer = t(`issuer.${saudi && r.key === 'iqama' ? 'nationalId' : r.key}`);
    const file =
      docs
        .filter((d) => d.status === 'available' && r.categories.includes(d.category))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    // The record's date is the authority (it is what alerts and the work queue
    // read). When the record has none, the scanned file's own expiry is shown
    // rather than "not on file" — Renew still writes the record.
    const iso = notApplicable
      ? null
      : ((r.field ? r.field.read(emp) : null) ?? file?.expiryDate ?? null);
    const days = iso ? daysTo(iso) : null;
    const canRenew =
      !!r.field &&
      !notApplicable &&
      !!iso &&
      canWrite[r.field.group] &&
      (days! <= 90 || !!renewed[r.key]);
    return { ...r, label, issuer, iso, days, file, notApplicable, canRenew };
  });
  const dated = rows.filter((r) => r.iso).length;
  const files = new Set(rows.map((r) => r.file?.id).filter(Boolean)).size;

  async function openFile(doc: DocumentResponse) {
    setError('');
    try {
      const res = await apiFetch<{ url: string }>(`/documents/${doc.id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('fileError'));
    }
  }

  // ---- renew ----
  const [renewKey, setRenewKey] = useState<RowKey | null>(null);
  const renewRow = rows.find((r) => r.key === renewKey) ?? null;
  const [newIso, setNewIso] = useState('');
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState('');

  const renewOptions = useMemo(() => {
    if (!renewRow?.cycleMonths) return [];
    const base = renewRow.iso && daysTo(renewRow.iso) > 0 ? renewRow.iso : todayIso();
    const suggested = addMonths(base, renewRow.cycleMonths);
    const set = new Set([
      suggested,
      ...[-3, -2, -1, 1, 2, 3, 6, 12].map((m) => addMonths(suggested, m)),
    ]);
    return [...set].filter((d) => daysTo(d) > 0).sort();
  }, [renewRow?.key, renewRow?.iso]);

  const openRenew = (key: RowKey) => {
    const row = rows.find((r) => r.key === key)!;
    const base = row.iso && daysTo(row.iso) > 0 ? row.iso : todayIso();
    setNewIso(addMonths(base, row.cycleMonths ?? 12));
    setRenewError('');
    setRenewKey(key);
  };

  async function submitRenew() {
    if (!renewRow?.field || !newIso) return;
    setRenewing(true);
    setRenewError('');
    try {
      const url =
        renewRow.field.group === 'gov' ? `/employees/${emp.id}/govdata` : `/employees/${emp.id}`;
      const updated = await apiFetch<EmployeeResponse>(url, {
        method: 'PATCH',
        body: JSON.stringify({ [renewRow.field.key]: newIso }),
      });
      onSaved(updated);
      setRenewed((r) => ({ ...r, [renewRow.key]: todayIso() }));
      setRenewKey(null);
      toastSuccess(t('renewDone', { label: renewRow.label, date: day(newIso) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setRenewError(t('renewError'));
    } finally {
      setRenewing(false);
    }
  }

  // ---- add document (the DOC-02 presigned flow, for this employee) ----
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ category: DocumentCategory; title: string; expiry: string }>({
    category: 'iqama',
    title: '',
    expiry: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addError, setAddError] = useState('');

  async function submitAdd(e: FormEvent) {
    e.preventDefault();
    if (!file || !form.title.trim()) return;
    setUploading(true);
    setAddError('');
    try {
      const issued = await apiFetch<UploadIssueResponse>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          clientId: emp.clientId,
          employeeId: emp.id,
          category: form.category,
          title: form.title.trim(),
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          ...(form.expiry ? { expiryDate: form.expiry } : {}),
        }),
      });
      const put = await fetch(issued.upload.url, {
        method: 'PUT',
        headers: issued.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      await apiFetch(`/documents/${issued.document.id}/confirm`, { method: 'POST' });
      setAddOpen(false);
      setFile(null);
      setForm({ category: 'iqama', title: '', expiry: '' });
      await loadDocs();
      toastSuccess(t('added', { title: issued.document.title }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setAddError(t('addError'));
    } finally {
      setUploading(false);
    }
  }

  const name = locale === 'ar' ? emp.name.ar : emp.name.en;

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <h2 className="text-base leading-6 font-medium">{t('title')}</h2>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {t('subtitle', { dated, files })}
          </span>
        </span>
        {canUpload && (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
            {t('add')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div
        role="region"
        aria-label={t('title')}
        tabIndex={0}
        className="overflow-x-auto outline-ring focus-visible:outline-2"
      >
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0">
          {/* The prototype's 1.5fr 1.4fr 132px 88px 216px. The fixed columns are
              exact; the two flexible ones are left unsized so a fixed-layout
              table gives them ALL the remaining width (sized, the browser also
              spread the remainder into the fixed ones — measured 143/95/234). They
              split it evenly, against the prototype's 52/48. */}
          <colgroup>
            <col />
            <col />
            <col style={{ width: 132 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 216 }} />
          </colgroup>
          <thead>
            <tr className="text-xs leading-4 font-medium text-muted-foreground [&>th]:border-t [&>th]:bg-neutral-100 [&>th]:py-2 [&>th]:font-medium">
              <th className="px-4 text-start">{t('colDocument')}</th>
              <th className="px-4 text-start">{t('colFile')}</th>
              <th className="px-4 text-end">{t('colExpires')}</th>
              <th className="px-2 text-center">{t('colStatus')}</th>
              <th className="px-4 text-end">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="h-[60px] [&>td]:border-t">
                <td className="px-4">
                  <span className="flex items-center gap-3">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm leading-[19px] font-medium">{r.label}</span>
                      <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                        {r.issuer}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-4">
                  {r.file ? (
                    <span className="flex min-w-0 flex-col">
                      <bdi dir="ltr" className="truncate text-start font-mono text-xs leading-4">
                        {r.file.fileName}
                      </bdi>
                      <span className="text-[11px] leading-[15px] text-muted-foreground">
                        {kind(r.file)} · {size(r.file.sizeBytes)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">
                      {r.field ? t('noFile') : t('soon')}
                    </span>
                  )}
                </td>
                <td className="px-4 text-end">
                  {r.iso ? (
                    <span className="flex flex-col items-end">
                      <span className="text-[13px] leading-[17px]">{day(r.iso)}</span>
                      <span className="text-[10px] leading-[14px] text-neutral-400">
                        {hijri(r.iso)}
                      </span>
                      {renewed[r.key] && (
                        <span className="text-[10px] leading-[14px] text-status-ok">
                          {t('renewed', { date: day(renewed[r.key]!) })}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[13px] text-neutral-400">
                      {r.notApplicable
                        ? saudi && r.key === 'iqama'
                          ? t('noExpiry')
                          : t('notApplicable')
                        : r.field
                          ? t('notOnFile')
                          : '—'}
                    </span>
                  )}
                </td>
                <td className="px-2 text-center">
                  {r.days != null ? (
                    <span
                      className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                        chipClass(r.days),
                      )}
                    >
                      {chipText(r.days)}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4">
                  <span className="flex items-center justify-end gap-1.5">
                    {r.field && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={!r.file}
                          onClick={() => r.file && void openFile(r.file)}
                          aria-label={`${t('view')} — ${r.label}`}
                          title={r.file ? t('view') : t('noFileTitle')}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={!r.file}
                          onClick={() => r.file && void openFile(r.file)}
                          aria-label={`${t('download')} — ${r.label}`}
                          title={r.file ? t('download') : t('noFileTitle')}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </>
                    )}
                    {r.canRenew && (
                      <Button variant="outline" size="xs" onClick={() => openRenew(r.key)}>
                        {renewed[r.key] ? t('renewAgain') : t('renew')}
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Record a renewal ---- */}
      <Dialog open={renewRow !== null} onOpenChange={(o) => !o && setRenewKey(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('renewTitle')}</DialogTitle>
            <DialogDescription>{t('renewDescription')}</DialogDescription>
          </DialogHeader>
          {renewRow && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-start gap-3 rounded-lg bg-neutral-50 px-3 py-2.5 ring-1 ring-foreground/10">
                <span className="flex min-w-0 grow flex-col gap-px">
                  <span className="text-sm leading-[19px] font-medium">{renewRow.label}</span>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {name} · {clientName}
                  </span>
                  <span className="text-[11px] leading-[15px] text-neutral-400">
                    {renewRow.issuer}
                  </span>
                </span>
                {renewRow.iso && renewRow.days != null && (
                  <span className="flex shrink-0 flex-col items-end gap-[3px]">
                    <span className="text-xs leading-4 text-muted-foreground">
                      {t('expires', { date: day(renewRow.iso) })}
                    </span>
                    <span
                      className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5',
                        chipClass(renewRow.days),
                      )}
                    >
                      {chipText(renewRow.days)}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rn-date">{t('newExpiry')}</Label>
                <Select value={newIso} onValueChange={(v) => setNewIso(v ?? '')}>
                  <SelectTrigger id="rn-date" className="w-full">
                    <SelectValue>{(v) => (v ? day(String(v)) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {renewOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {day(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {t('cycle', { years: (renewRow.cycleMonths ?? 12) / 12 })}
                </span>
              </div>
              {renewError && (
                <p role="alert" className="text-sm text-destructive">
                  {renewError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="grow text-[11px] leading-[15px] text-muted-foreground">
                  {newIso ? t('cover', { days: daysTo(newIso), hijri: hijri(newIso) }) : ''}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setRenewKey(null)}>
                  {t('cancel')}
                </Button>
                <Button size="sm" onClick={() => void submitRenew()} disabled={renewing || !newIso}>
                  {renewing ? t('recording') : t('record')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Add a document ---- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('addTitle')}</DialogTitle>
            <DialogDescription>{t('addDescription', { name })}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdd} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-cat">{t('category')}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm({ ...form, category: (v as DocumentCategory) ?? 'other' })
                  }
                >
                  <SelectTrigger id="ad-cat" className="w-full">
                    <SelectValue>{(v) => tc(String(v))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {tc(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-expiry">{t('expiry')}</Label>
                <Input
                  id="ad-expiry"
                  type="date"
                  value={form.expiry}
                  onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-title">{t('docTitle')}</Label>
              <Input
                id="ad-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-file">{t('file')}</Label>
              <Input
                id="ad-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            {addError && (
              <p role="alert" className="text-sm text-destructive">
                {addError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={uploading || !file || !form.title.trim()}>
                {uploading ? t('uploading') : t('upload')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
