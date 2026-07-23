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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

const STATUS_VARIANT: Record<RequestStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'secondary',
  in_progress: 'default',
  resolved: 'default',
  closed: 'outline',
  cancelled: 'destructive',
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

  const [fClient, setFClient] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  // create dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // process dialog
  const [procTarget, setProcTarget] = useState<RequestResponse | null>(null);
  const [procNext, setProcNext] = useState<RequestStatus | ''>('');
  const [procSaving, setProcSaving] = useState(false);
  const [procError, setProcError] = useState('');

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

  function openProcess(r: RequestResponse) {
    setProcTarget(r);
    setProcNext(NEXT[r.status][0] ?? '');
    setProcError('');
  }

  async function process(e: FormEvent) {
    e.preventDefault();
    if (!procTarget || !procNext) return;
    setProcSaving(true);
    setProcError('');
    try {
      await apiFetch(`/requests/${procTarget.id}/process`, {
        method: 'POST',
        body: JSON.stringify({ status: procNext }),
      });
      setProcTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setProcError(t('saveError'));
    } finally {
      setProcSaving(false);
    }
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colTitle')}</TableHead>
              <TableHead>{t('colClient')}</TableHead>
              <TableHead>{t('colType')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              <TableHead>{t('colPriority')}</TableHead>
              <TableHead>{t('colDue')}</TableHead>
              <TableHead className="text-end">{t('colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {clientName(r.clientId)}
                </TableCell>
                <TableCell>{t(`type.${r.type}`)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
                </TableCell>
                <TableCell>{t(`priority.${r.priority}`)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {dualDate(r.dueDate, locale) ?? t('none')}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {canProcess && NEXT[r.status].length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => openProcess(r)}>
                        {t('process')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {requests.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
            <div className="grid grid-cols-2 gap-3">
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
              <textarea
                id="r-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
      <Dialog open={procTarget !== null} onOpenChange={(o) => !o && setProcTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('processTitle')}</DialogTitle>
          </DialogHeader>
          {procTarget && (
            <form onSubmit={process} className="space-y-4">
              <div className="text-sm font-medium">{procTarget.title}</div>
              <div className="text-sm text-muted-foreground">
                {t('currentStatus')}: {t(`status.${procTarget.status}`)}
              </div>
              <div className="space-y-1.5">
                <Label>{t('nextStatus')}</Label>
                <Select value={procNext} onValueChange={(v) => setProcNext((v as RequestStatus) ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? t(`status.${String(v)}`) : '')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {NEXT[procTarget.status].map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {procError && <p className="text-sm text-destructive">{procError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProcTarget(null)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={procSaving || !procNext}>
                  {procSaving ? t('saving') : t('submit')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
