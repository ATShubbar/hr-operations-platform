'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  EmployeeListResponse,
  EmployeeResponse,
  GroProcessListResponse,
  GroProcessResponse,
  GroProcessStatus,
  GroProcessType,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
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

const TYPES: readonly GroProcessType[] = [
  'iqama_issue',
  'iqama_renewal',
  'exit_reentry',
  'final_exit',
  'profession_change',
  'sponsorship_transfer',
  'work_permit_renewal',
  'other',
];
const STATUSES: readonly GroProcessStatus[] = [
  'not_started',
  'in_progress',
  'submitted',
  'approved',
  'rejected',
  'completed',
  'cancelled',
];
const ALL = 'all';

// Legal next statuses, mirrored client-side so the dialog only offers valid moves
// (the API validates authoritatively — GRO-02). Terminal states have none.
const NEXT: Record<GroProcessStatus, readonly GroProcessStatus[]> = {
  not_started: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Types whose completion writes a resulting expiry back to the employee (GRO-03) —
// so the status dialog prompts for it.
const EXPIRY_TYPES: ReadonlySet<GroProcessType> = new Set([
  'iqama_issue',
  'iqama_renewal',
  'exit_reentry',
  'work_permit_renewal',
]);

interface CreateForm {
  employeeId: string;
  type: GroProcessType;
  dueDate: string;
  referenceNumber: string;
}
const EMPTY_CREATE: CreateForm = { employeeId: '', type: 'iqama_renewal', dueDate: '', referenceNumber: '' };

// GRO console (GRO-04) over the gro.* API (GRO-02/03). Staff, cross-client. Create
// + status transitions need gro.process; completing an expiry-type process captures
// the resulting expiry, which the API writes back to the employee's govdata.
export default function GroPage() {
  const t = useTranslations('gro');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canProcess = useCan('gro.process');

  const [processes, setProcesses] = useState<GroProcessResponse[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fClient, setFClient] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // status dialog
  const [stTarget, setStTarget] = useState<GroProcessResponse | null>(null);
  const [stNext, setStNext] = useState<GroProcessStatus | ''>('');
  const [stExpiry, setStExpiry] = useState('');
  const [stSaving, setStSaving] = useState(false);
  const [stError, setStError] = useState('');

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? (locale === 'ar' ? e.name.ar : e.name.en) : id.slice(0, 8);
  };
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : id.slice(0, 8);
  };

  async function loadRefs() {
    try {
      const [emp, cli] = await Promise.all([
        apiFetch<EmployeeListResponse>('/employees'),
        apiFetch<ClientListResponse>('/clients'),
      ]);
      setEmployees(emp.employees);
      setClients(cli.clients);
    } catch {
      /* name resolution is best-effort */
    }
  }

  async function load(clientFilter?: string) {
    const c = clientFilter ?? fClient;
    setLoading(true);
    setError('');
    try {
      const qs = c !== ALL ? `?clientId=${c}` : '';
      const res = await apiFetch<GroProcessListResponse>(`/gro-processes${qs}`);
      setProcesses(res.processes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadRefs();
  }, []);

  const shown = useMemo(
    () => processes.filter((p) => fStatus === ALL || p.status === fStatus),
    [processes, fStatus],
  );

  // GRO's two filters live in different places — client is a server query param,
  // status is the `shown` memo — so clearing has to reset both.
  const onClearFilters = () => {
    setFStatus(ALL);
    setFClient(ALL);
    void load(ALL);
  };

  function openCreate() {
    setForm({ ...EMPTY_CREATE, employeeId: employees[0]?.id ?? '' });
    setFormError('');
    setOpen(true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch('/gro-processes', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.employeeId,
          type: form.type,
          ...(form.dueDate ? { dueDate: form.dueDate } : {}),
          ...(form.referenceNumber ? { referenceNumber: form.referenceNumber } : {}),
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

  function openStatus(p: GroProcessResponse) {
    setStTarget(p);
    setStNext(NEXT[p.status][0] ?? '');
    setStExpiry(p.resultingExpiry ?? '');
    setStError('');
  }

  async function submitStatus(e: FormEvent) {
    e.preventDefault();
    if (!stTarget || !stNext) return;
    setStSaving(true);
    setStError('');
    try {
      // Completing an expiry-type process: capture the resulting expiry first, so
      // the status change (GRO-03) writes it back to the employee's govdata.
      if (stNext === 'completed' && EXPIRY_TYPES.has(stTarget.type) && stExpiry) {
        await apiFetch(`/gro-processes/${stTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ resultingExpiry: stExpiry }),
        });
      }
      await apiFetch(`/gro-processes/${stTarget.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: stNext }),
      });
      setStTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setStError(t('saveError'));
    } finally {
      setStSaving(false);
    }
  }

  const promptExpiry = !!stTarget && stNext === 'completed' && EXPIRY_TYPES.has(stTarget.type);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canProcess && (
          <Button onClick={openCreate} disabled={employees.length === 0}>
            {t('new')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>{t('filterClient')}</Label>
          <Select
            value={fClient}
            onValueChange={(v) => {
              setFClient(v ?? ALL);
              void load(v ?? ALL);
            }}
          >
            <SelectTrigger className="w-48">
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
            <SelectTrigger className="w-44">
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
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        rows={shown}
        loading={loading}
        rowKey={(p) => p.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'due', dir: 'asc' }}
        emptyTitle={t('empty')}
        filtersActive={fClient !== ALL || fStatus !== ALL}
        onClearFilters={onClearFilters}
        columns={[
          {
            key: 'employee',
            header: t('colEmployee'),
            sortValue: (p) => empName(p.employeeId),
            // The reference number is searchable though it has its own column:
            // it is how a GRO officer identifies a case on the phone to a ministry.
            searchValues: (p) => [empName(p.employeeId), p.referenceNumber, t(`type.${p.type}`)],
            cell: (p) => <span className="font-medium">{empName(p.employeeId)}</span>,
          },
          {
            key: 'type',
            header: t('colType'),
            sortValue: (p) => t(`type.${p.type}`),
            cell: (p) => t(`type.${p.type}`),
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (p) => p.status,
            cell: (p) => (
              <StatusPill tone={toneFor('gro', p.status)}>{t(`status.${p.status}`)}</StatusPill>
            ),
          },
          {
            key: 'due',
            header: t('colDue'),
            sortValue: (p) => p.dueDate,
            cell: (p) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {dualDate(p.dueDate, locale) ?? t('none')}
              </span>
            ),
          },
          {
            key: 'reference',
            header: t('colReference'),
            sortValue: (p) => p.referenceNumber ?? '',
            cell: (p) => (
              <span className="text-sm text-muted-foreground">{p.referenceNumber ?? t('none')}</span>
            ),
          },
          {
            key: 'resultingExpiry',
            header: t('colResultingExpiry'),
            sortValue: (p) => p.resultingExpiry,
            cell: (p) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {dualDate(p.resultingExpiry, locale) ?? t('none')}
              </span>
            ),
          },
        ]}
        actions={
          canProcess
            ? (p) => (
                <div className="flex justify-end">
                  {NEXT[p.status].length > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => openStatus(p)}>
                      {t('changeStatus')}
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('terminal')}</span>
                  )}
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
              <Label>{t('fieldEmployee')}</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v ?? '' })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectEmployee')}>
                    {(v) => (v ? empName(String(v)) : t('selectEmployee'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {locale === 'ar' ? e.name.ar : e.name.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('fieldType')}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: (v as GroProcessType) ?? 'other' })}>
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
                <Label htmlFor="g-due">{t('fieldDue')}</Label>
                <Input id="g-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-ref">{t('fieldReference')}</Label>
              <Input id="g-ref" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} dir="ltr" />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.employeeId}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status dialog */}
      <Dialog open={!!stTarget} onOpenChange={(o) => !o && setStTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('statusTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitStatus} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('fieldNextStatus')}</Label>
              <Select value={stNext} onValueChange={(v) => setStNext((v as GroProcessStatus) ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v ? t(`status.${String(v)}`) : '')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(stTarget ? NEXT[stTarget.status] : []).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {promptExpiry && (
              <div className="space-y-1.5">
                <Label htmlFor="g-exp">{t('fieldResultingExpiry')}</Label>
                <Input id="g-exp" type="date" value={stExpiry} onChange={(e) => setStExpiry(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t('resultingExpiryHint')}</p>
              </div>
            )}
            {stError && <p className="text-sm text-destructive">{stError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStTarget(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={stSaving || !stNext}>
                {stSaving ? t('saving') : t('apply')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
