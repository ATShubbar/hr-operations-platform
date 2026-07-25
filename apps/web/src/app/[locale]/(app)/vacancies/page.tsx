'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  VacancyListResponse,
  VacancyResponse,
  VacancyStatus,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { type Locale } from '@/lib/employee-format';
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

const STATUSES = ['draft', 'open', 'filled', 'closed', 'cancelled'] as const;
const ALL = 'all';

// Legal next statuses, mirrored client-side so the menu only offers valid moves
// (the API validates authoritatively — REC-02). Terminal states have none.
const NEXT: Record<VacancyStatus, readonly VacancyStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['filled', 'closed', 'cancelled'],
  filled: ['closed'],
  closed: [],
  cancelled: [],
};

interface CreateForm {
  clientId: string;
  titleAr: string;
  titleEn: string;
  department: string;
  headcount: string;
}
const EMPTY_CREATE: CreateForm = { clientId: '', titleAr: '', titleEn: '', department: '', headcount: '1' };

// Vacancies console (REC-06) over the vacancy.* API (REC-02). Staff, cross-client.
// Create needs vacancy.create; the status action needs vacancy.approve — both
// hidden without the capability.
export default function VacanciesPage() {
  const t = useTranslations('vacancies');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('vacancy.create');
  const canApprove = useCan('vacancy.approve');

  const [vacancies, setVacancies] = useState<VacancyResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [fClient, setFClient] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
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

  async function load(clientFilter?: string) {
    const c = clientFilter ?? fClient;
    setLoading(true);
    setError('');
    try {
      const qs = c !== ALL ? `?clientId=${c}` : '';
      const res = await apiFetch<VacancyListResponse>(`/vacancies${qs}`);
      setVacancies(res.vacancies);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
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

  const shown = vacancies.filter((v) => fStatus === ALL || v.status === fStatus);

  // Client is a server query param, status is the `shown` filter — clear both.
  const onClearFilters = () => {
    setFStatus(ALL);
    setFClient(ALL);
    void load(ALL);
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
      await apiFetch('/vacancies', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          title: { ar: form.titleAr, en: form.titleEn },
          ...(form.department ? { department: form.department } : {}),
          headcount: Number(form.headcount) || 1,
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

  async function changeStatus(v: VacancyResponse, status: VacancyStatus) {
    try {
      await apiFetch(`/vacancies/${v.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
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
        <NoAccess capability="vacancy.read" />
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
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={vacancies.length > 0} />
      )}

      <DataTable
        rows={shown}
        loading={loading}
        rowKey={(v) => v.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'title', dir: 'asc' }}
        emptyTitle={t('empty')}
        filtersActive={fClient !== ALL || fStatus !== ALL}
        onClearFilters={onClearFilters}
        columns={[
          {
            key: 'title',
            header: t('colTitle'),
            sortValue: (v) => (locale === 'ar' ? v.title.ar : v.title.en),
            // Both title languages are searchable: a vacancy is often created in
            // English and looked up in the Arabic UI.
            searchValues: (v) => [v.title.ar, v.title.en, v.department],
            cell: (v) => (
              <span className="font-medium">{locale === 'ar' ? v.title.ar : v.title.en}</span>
            ),
          },
          {
            key: 'client',
            header: t('colClient'),
            sortValue: (v) => clientName(v.clientId),
            searchValues: (v) => [clientName(v.clientId)],
            cell: (v) => clientName(v.clientId),
          },
          {
            key: 'department',
            header: t('colDepartment'),
            sortValue: (v) => v.department ?? '',
            cell: (v) => v.department ?? t('none'),
          },
          {
            key: 'headcount',
            header: t('colHeadcount'),
            numeric: true,
            sortValue: (v) => v.headcount,
            cell: (v) => v.headcount,
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (v) => v.status,
            cell: (v) => (
              <StatusPill tone={toneFor('vacancy', v.status)}>{t(`status.${v.status}`)}</StatusPill>
            ),
          },
        ]}
        actions={
          canApprove
            ? (v) => (
                <div className="flex justify-end">
                  {NEXT[v.status].length > 0 ? (
                    <Select
                      value=""
                      onValueChange={(s) => s && void changeStatus(v, s as VacancyStatus)}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder={t('changeStatus')}>
                          {() => t('changeStatus')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {NEXT[v.status].map((s) => (
                          <SelectItem key={s} value={s}>
                            {t(`status.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('terminal')}</span>
                  )}
                </div>
              )
            : undefined
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('fieldClient')}</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v ?? '' })}>
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
                <Label htmlFor="v-ar">{t('fieldTitleAr')}</Label>
                <Input id="v-ar" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} required dir="rtl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-en">{t('fieldTitleEn')}</Label>
                <Input id="v-en" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} required dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v-dep">{t('fieldDepartment')}</Label>
                <Input id="v-dep" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-hc">{t('fieldHeadcount')}</Label>
                <Input id="v-hc" type="number" min={1} value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.clientId || !form.titleAr || !form.titleEn}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
