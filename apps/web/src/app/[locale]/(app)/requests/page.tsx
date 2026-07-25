'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  RequestListResponse,
  RequestResponse,
  RequestStatus,
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusAction } from '@/components/ui/status-action';
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';

const TYPES = ['letter', 'certificate', 'document', 'gro_service', 'general'] as const;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;
const ALL = 'all';

// The status workflow, mirrored client-side so the process dialog only offers
// legal next steps (the API validates authoritatively — REQ-03).
const NEXT: Record<RequestStatus, readonly RequestStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

interface CreateForm {
  clientId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
}
const EMPTY_CREATE: CreateForm = {
  clientId: '',
  type: 'general',
  title: '',
  description: '',
  priority: 'normal',
  dueDate: '',
};

// Requests console (REQ-04) over the request.* API (REQ-02/03). Staff list/create
// and process requests; the API scopes client reps to their own client (the
// dedicated client portal ships with 5.1). Create needs request.create; the
// Process action needs request.process — both hidden without the capability.
export default function RequestsPage() {
  const t = useTranslations('requests');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('request.create');
  const canProcess = useCan('request.process');

  const [requests, setRequests] = useState<RequestResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [fClient, setFClient] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  // create dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // process dialog

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

  async function load(filters?: { client: string; status: string }) {
    const f = filters ?? { client: fClient, status: fStatus };
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (f.client !== ALL) params.set('clientId', f.client);
      if (f.status !== ALL) params.set('status', f.status);
      const qs = params.toString();
      const res = await apiFetch<RequestListResponse>(`/requests${qs ? `?${qs}` : ''}`);
      setRequests(res.requests);
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
    setFStatus(ALL);
    void load({ client: ALL, status: ALL });
  };

  function openCreate() {
    setForm({ ...EMPTY_CREATE, clientId: clients.find((c) => c.status === 'active')?.id ?? '' });
    setFormError('');
    setOpen(true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch('/requests', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          type: form.type,
          title: form.title,
          ...(form.description ? { description: form.description } : {}),
          priority: form.priority,
          ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        }),
      });
      setOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  // Applied straight from the row's status menu (UX-09). The dialog this used to
  // open contained ONLY a next-status Select — the row already shows the title
  // and current status the dialog was repeating, so it was three clicks to
  // deliver one choice. A failure surfaces in the page's error banner, which
  // keeps the table on screen (UX-06).
  async function processRequest(r: RequestResponse, next: RequestStatus) {
    setError('');
    try {
      await apiFetch(`/requests/${r.id}/process`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
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
        <NoAccess capability="request.read" />
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
        {canCreate && <Button onClick={openCreate}>{t('new')}</Button>}
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
          <Label>{t('filterStatus')}</Label>
          <Select value={fStatus} onValueChange={(v) => setFStatus(v ?? ALL)}>
            <SelectTrigger className="w-40">
              <SelectValue>{(v) => (v === ALL ? t('filterAll') : t(`status.${String(v)}`))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filterAll')}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
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

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={requests.length > 0} />
      )}

      <DataTable
        rows={requests}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'due', dir: 'asc' }}
        emptyTitle={t('empty')}
        filtersActive={fClient !== ALL || fStatus !== ALL}
        onClearFilters={onClear}
        columns={[
          {
            key: 'title',
            header: t('colTitle'),
            sortValue: (r) => r.title,
            searchValues: (r) => [r.title, r.description, t(`type.${r.type}`)],
            cell: (r) => <span className="font-medium">{r.title}</span>,
          },
          {
            key: 'client',
            header: t('colClient'),
            sortValue: (r) => clientName(r.clientId),
            searchValues: (r) => [clientName(r.clientId)],
            cell: (r) => (
              <span className="text-sm text-muted-foreground">{clientName(r.clientId)}</span>
            ),
          },
          {
            key: 'type',
            header: t('colType'),
            sortValue: (r) => t(`type.${r.type}`),
            cell: (r) => t(`type.${r.type}`),
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (r) => r.status,
            cell: (r) => (
              <StatusPill tone={toneFor('request', r.status)}>{t(`status.${r.status}`)}</StatusPill>
            ),
          },
          {
            key: 'priority',
            header: t('colPriority'),
            sortValue: (r) => r.priority,
            cell: (r) => t(`priority.${r.priority}`),
          },
          {
            key: 'due',
            header: t('colDue'),
            sortValue: (r) => r.dueDate,
            cell: (r) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {dualDate(r.dueDate, locale) ?? t('none')}
              </span>
            ),
          },
        ]}
        actions={
          canProcess
            ? (r) => (
                <div className="flex justify-end">
                  <StatusAction
                    next={NEXT[r.status]}
                    onSelect={(s) => void processRequest(r, s)}
                    label={(s) => t(`status.${s}`)}
                    placeholder={t('process')}
                  />
                </div>
              )
            : undefined
        }
      />

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
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
                <Label>{t('fieldType')}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? 'general' })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => t(`type.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((ty) => (
                      <SelectItem key={ty} value={ty}>
                        {t(`type.${ty}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fieldPriority')}</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v ?? 'normal' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => t(`priority.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`priority.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-title">{t('fieldTitle')}</Label>
              <Input
                id="r-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-desc">{t('fieldDescription')}</Label>
              <Textarea
                id="r-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-due">{t('fieldDue')}</Label>
              <Input
                id="r-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-44"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.clientId || !form.title}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Process dialog */}
    </div>
  );
}
