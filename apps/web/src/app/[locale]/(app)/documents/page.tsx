'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  DocumentListResponse,
  DocumentResponse,
  DownloadResponse,
  UploadIssueResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';

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

interface UploadForm {
  clientId: string;
  category: string;
  title: string;
  expiryDate: string;
}
const EMPTY_UPLOAD: UploadForm = { clientId: '', category: 'other', title: '', expiryDate: '' };

// Documents console (DOC-05) over the document.* API (DOC-02/03). List with an
// expiry view; upload uses the presigned two-step flow (issue → PUT bytes
// straight to storage → confirm), so the blob never passes through this app or
// the API. Download/delete gated by capability; a 401 means the session lapsed.
export default function DocumentsPage() {
  const t = useTranslations('documents');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canUpload = useCan('document.upload');
  const canDelete = useCan('document.delete');

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  // filters
  const [fClient, setFClient] = useState(ALL);
  const [fCategory, setFCategory] = useState(ALL);
  const [fExpiring, setFExpiring] = useState('');

  // upload dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UploadForm>(EMPTY_UPLOAD);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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

  async function load(filters?: { client: string; category: string; expiring: string }) {
    const f = filters ?? { client: fClient, category: fCategory, expiring: fExpiring };
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (f.client !== ALL) params.set('clientId', f.client);
      if (f.category !== ALL) params.set('category', f.category);
      if (f.expiring) params.set('expiringBefore', f.expiring);
      const qs = params.toString();
      const res = await apiFetch<DocumentListResponse>(`/documents${qs ? `?${qs}` : ''}`);
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

  // UX-13: each control refetches itself, no Apply button. The date field uses
  // `change` rather than `input`: an <input type="date"> reports '' until all
  // three segments are filled, so committing a date fires once — typing into it
  // does not produce a request per keystroke.
  const applyFilters = (patch: Partial<{ client: string; category: string; expiring: string }>) => {
    const next = { client: fClient, category: fCategory, expiring: fExpiring, ...patch };
    setFClient(next.client);
    setFCategory(next.category);
    setFExpiring(next.expiring);
    void load(next);
  };
  const onClear = () => {
    setFClient(ALL);
    setFCategory(ALL);
    setFExpiring('');
    void load({ client: ALL, category: ALL, expiring: '' });
  };

  function openUpload() {
    setForm({ ...EMPTY_UPLOAD, clientId: clients.find((c) => c.status === 'active')?.id ?? '' });
    setFile(null);
    setFormError('');
    setOpen(true);
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    setFormError('');
    try {
      // 1) issue — pending metadata + presigned PUT URL
      const issued = await apiFetch<UploadIssueResponse>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          category: form.category,
          title: form.title,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
        }),
      });
      // 2) transfer the bytes DIRECTLY to object storage (not via the API)
      const put = await fetch(issued.upload.url, {
        method: 'PUT',
        headers: issued.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      // 3) confirm — verifies the blob and marks it available
      await apiFetch(`/documents/${issued.document.id}/confirm`, { method: 'POST' });
      setOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function download(doc: DocumentResponse) {
    try {
      const res = await apiFetch<DownloadResponse>(`/documents/${doc.id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
      else setError(t('error'));
    }
  }

  async function remove(doc: DocumentResponse) {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await apiFetch(`/documents/${doc.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
      else setError(t('saveError'));
    }
  }

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
        {canUpload && <Button onClick={openUpload}>{t('new')}</Button>}
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={documents.length > 0} />
      )}

      <DataTable
        rows={documents}
        loading={loading}
        rowKey={(d) => d.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'title', dir: 'asc' }}
        emptyTitle={t('empty')}
        // The filter form above is SERVER-side, so an empty result there is
        // indistinguishable from an empty table unless we say so.
        filtersActive={fClient !== ALL || fCategory !== ALL || fExpiring !== ''}
        onClearFilters={onClear}
        // Beside the search, no Apply button (UX-13) — but WITH visible labels.
        //
        // Three filters reading "All / All / dd-mm-yyyy" say nothing about what
        // they filter, and this is the only screen with that many. The labels are
        // real `htmlFor` associations, not decorative text beside an aria-label:
        // <button> is a labelable element, so a <label for> pointing at the
        // Select's trigger is a genuine one, and the aria-label it replaces is
        // gone rather than left to duplicate the name.
        filters={
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-client">{t('filterClient')}</Label>
              <Select value={fClient} onValueChange={(v) => applyFilters({ client: v ?? ALL })}>
                <SelectTrigger id="f-client" className="w-44">
                  <SelectValue>
                    {(v) => (v === ALL ? t('filterAll') : clientName(String(v)))}
                  </SelectValue>
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-category">{t('filterCategory')}</Label>
              <Select
                value={fCategory}
                onValueChange={(v) => applyFilters({ category: v ?? ALL })}
              >
                <SelectTrigger id="f-category" className="w-40">
                  <SelectValue>
                    {(v) => (v === ALL ? t('filterAll') : t(`category.${String(v)}`))}
                  </SelectValue>
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-exp">{t('filterExpiring')}</Label>
              {/* The one non-Select filter in the app. `onChange` on a date input
                  fires on commit, not per keystroke — verified, one request. */}
              <Input
                id="f-exp"
                type="date"
                value={fExpiring}
                onChange={(e) => applyFilters({ expiring: e.target.value })}
                className="h-8 w-44"
              />
            </div>
          </>
        }
        columns={[
          {
            key: 'title',
            header: t('colTitle'),
            sortValue: (d) => d.title,
            searchValues: (d) => [d.title, t(`category.${d.category}`), d.category],
            cell: (d) => <span className="font-medium">{d.title}</span>,
          },
          {
            key: 'category',
            header: t('colCategory'),
            sortValue: (d) => t(`category.${d.category}`),
            cell: (d) => t(`category.${d.category}`),
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (d) => d.status,
            cell: (d) => (
              <StatusPill tone={toneFor('document', d.status)}>{t(`status.${d.status}`)}</StatusPill>
            ),
          },
          {
            key: 'expiry',
            header: t('colExpiry'),
            // Raw ISO, never the rendered dual-calendar string.
            sortValue: (d) => d.expiryDate,
            cell: (d) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {dualDate(d.expiryDate, locale) ?? t('none')}
              </span>
            ),
          },
        ]}
        actions={(d) => (
          <div className="flex justify-end gap-2">
            {d.status === 'available' && (
              <Button variant="outline" size="sm" onClick={() => void download(d)}>
                {t('download')}
              </Button>
            )}
            {canDelete && d.status !== 'deleted' && (
              <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                {t('delete')}
              </Button>
            )}
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('uploadTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={upload} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('fieldClient')}</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => setForm({ ...form, clientId: v ?? '' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectClient')}>
                    {(v) => (v ? clientName(String(v)) : t('selectClient'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {locale === 'ar' ? c.name.ar : c.name.en}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('fieldCategory')}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v ?? 'other' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => t(`category.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`category.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-exp">{t('fieldExpiry')}</Label>
                <Input
                  id="u-exp"
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-title">{t('fieldTitle')}</Label>
              <Input
                id="u-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-file">{t('fieldFile')}</Label>
              <input
                id="u-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="block w-full text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !file || !form.clientId}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
