'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileText, Trash2 } from 'lucide-react';
import type {
  DocumentCategory,
  DocumentListResponse,
  DocumentResponse,
  UploadIssueResponse,
} from '@hr/contracts';
import { formatHijri } from '@hr/dates';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { chipClass, daysTo } from '@/lib/employee-docs';
import { useCan } from '@/lib/session';
import { toneFor } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { toastSuccess } from '@/components/ui/toast';

// The Client record's Records tab (DS-22a). Its first built part is the
// company's OWN documents — those attached to no person (the documents registry
// allows them; a person's documents live on their record, DS-07). This is where
// the retired /documents screen's company files went (owner decision).
//
// The prototype's Records content — main contact, signatories, registrations,
// portal credentials — needs the client profile feature, so it stays shown and
// "coming soon" below (owner rule).
//
// Upload is the DOC-02 presigned flow with no employee: issue → PUT straight to
// the object store → confirm (the virus-scan hook decides available vs
// quarantined). A document on legal hold cannot be deleted (DOC-04), so it
// offers no delete.

const CATEGORIES: readonly DocumentCategory[] = [
  'contract',
  'gosi',
  'visa',
  'national_id',
  'iqama',
  'passport',
  'cv',
  'other',
];

type Locale = 'ar' | 'en';

export function RecordsTab({ clientId }: { clientId: string }) {
  const t = useTranslations('clients.records');
  const tc = useTranslations('documents.category');
  const ts = useTranslations('states');
  const tp = useTranslations('people');
  const tSoon = useTranslations('clients.soon');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canUpload = useCan('document.upload');
  const canDelete = useCan('document.delete');

  const [docs, setDocs] = useState<DocumentResponse[] | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiFetch<DocumentListResponse>(`/documents?clientId=${clientId}`);
      // The company's own: attached to no person, and not deleted.
      setDocs(res.documents.filter((d) => d.employeeId === null && d.status !== 'deleted'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setDocs([]);
      setError(t('loadError'));
    }
  }
  useEffect(() => {
    void load();
  }, [clientId]);

  const day = (iso: string) => {
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

  async function open(doc: DocumentResponse) {
    setError('');
    try {
      const res = await apiFetch<{ url: string }>(`/documents/${doc.id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('fileError'));
    }
  }

  // ---- add ----
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ category: DocumentCategory; title: string; expiry: string }>({
    category: 'contract',
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
          clientId,
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
      setForm({ category: 'contract', title: '', expiry: '' });
      await load();
      toastSuccess(t('added', { title: issued.document.title }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setAddError(t('addError'));
    } finally {
      setUploading(false);
    }
  }

  // ---- delete ----
  const [removing, setRemoving] = useState<DocumentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await apiFetch(`/documents/${removing.id}`, { method: 'DELETE' });
      toastSuccess(t('removed', { title: removing.title }));
      setRemoving(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('removeError'));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="company-docs"
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <h2 id="company-docs" className="text-base leading-6 font-medium">
              {t('title')}
            </h2>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {t('subtitle')}
            </span>
          </span>
          {canUpload && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setAddError('');
                setAddOpen(true);
              }}
            >
              {t('add')}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {docs === null ? (
          <p className="border-t px-4 py-6 text-[13px] text-muted-foreground">{ts('loading')}</p>
        ) : docs.length === 0 ? (
          <p className="border-t px-4 py-8 text-center text-[13px] leading-[18px] text-neutral-400">
            {t('empty')}
          </p>
        ) : (
          <ul>
            {docs.map((d) => {
              const days = d.expiryDate ? daysTo(d.expiryDate) : null;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 grow basis-48 flex-col gap-px">
                    <span className="truncate text-sm leading-5 font-medium">{d.title}</span>
                    <span className="truncate text-xs leading-4 text-muted-foreground">
                      {tc(d.category)} ·{' '}
                      <bdi dir="ltr" className="font-mono">
                        {d.fileName}
                      </bdi>
                      {d.legalHold ? ` · ${t('legalHold')}` : ''}
                    </span>
                  </span>
                  {d.status !== 'available' && (
                    <StatusPill tone={toneFor('document', d.status)}>
                      {t(`status.${d.status}`)}
                    </StatusPill>
                  )}
                  <span className="flex w-28 shrink-0 flex-col items-end">
                    {d.expiryDate ? (
                      <>
                        <span className="text-[13px] leading-[17px]">{day(d.expiryDate)}</span>
                        <span className="text-[10px] leading-[14px] text-neutral-400">
                          {formatHijri(new Date(d.expiryDate), locale)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">{t('noExpiry')}</span>
                    )}
                  </span>
                  <span className="w-[86px] shrink-0 text-end">
                    {days !== null && (
                      <span
                        className={cn(
                          'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                          chipClass(days),
                        )}
                      >
                        {days < 0 ? tp('over', { n: Math.abs(days) }) : tp('left', { n: days })}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={d.status !== 'available'}
                      onClick={() => void open(d)}
                      aria-label={`${t('download')} — ${d.title}`}
                      title={t('download')}
                    >
                      <Download />
                    </Button>
                    {canDelete && !d.legalHold && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setRemoving(d)}
                        aria-label={`${t('remove')} — ${d.title}`}
                        title={t('remove')}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="company-profile-soon"
        className="rounded-xl bg-card p-6 ring-1 ring-foreground/10"
      >
        <h2 id="company-profile-soon" className="sr-only">
          {t('profileTitle')}
        </h2>
        <EmptyState variant="first-run" title={ts('comingSoon')} description={tSoon('records')} />
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="[&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t('addTitle')}</DialogTitle>
            <DialogDescription>{t('addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdd} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cd-cat">{t('category')}</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({ ...form, category: (v as DocumentCategory) ?? 'other' })
                }
              >
                <SelectTrigger id="cd-cat" className="w-full">
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
              <Label htmlFor="cd-title">{t('docTitle')}</Label>
              <Input
                id="cd-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cd-expiry">{t('expiry')}</Label>
              <Input
                id="cd-expiry"
                type="date"
                value={form.expiry}
                onChange={(e) => setForm({ ...form, expiry: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cd-file">{t('file')}</Label>
              <Input
                id="cd-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={uploading || !file || !form.title.trim()}>
                {uploading ? t('uploading') : t('upload')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('removeDescription', { title: removing?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirmRemove()}>
              {t('remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
