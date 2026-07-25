'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CalendarEventResponse,
  CalendarItem,
  CalendarViewResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { useViewItemLabels, type ViewItemKind } from '@/lib/view-item-labels';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const KIND_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  event: 'default',
  task: 'secondary',
  request: 'outline',
  gro: 'secondary',
};

interface EventForm {
  title: string;
  location: string;
  startAt: string; // datetime-local value
  endAt: string;
}
const EMPTY_EVENT: EventForm = { title: '', location: '', startAt: '', endAt: '' };

// ISO → the value a <input type="datetime-local"> expects (local, no seconds/TZ).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function timeLabel(iso: string, allDay: boolean): string {
  if (allDay) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Calendar console (CAL-03) over /calendar/view (CAL-02). An agenda grouped by day
// with dual-calendar headers: own events + read-only Task/Request/GRO deadlines,
// colour-coded by kind. Create/edit own events (calendar.create/update); delete is
// Company-Admin-only (calendar.delete).
export default function CalendarPage() {
  const t = useTranslations('calendar');
  // Skeleton and error-state copy lives in one shared namespace: a per-screen
  // `loading` key silently announced "calendar.loading" to screen readers when
  // the namespace happened not to define one (UX-06).
  const tStates = useTranslations('states');
  const { statusLabel, titleFor } = useViewItemLabels();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('calendar.create');
  const canUpdate = useCan('calendar.update');
  const canDelete = useCan('calendar.delete');

  // The visible month (first of month). Navigation shifts it.
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_EVENT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // UTC-anchored month bounds — building the ISO range from local-midnight dates
  // would shift the boundary a day under a non-zero UTC offset (and mislabel the
  // month). Item dates are UTC, so anchor the window in UTC too.
  const range = useMemo(() => {
    const from = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1));
    const to = new Date(Date.UTC(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      const res = await apiFetch<CalendarViewResponse>(`/calendar/view${qs}`);
      setItems([...res.items].sort((a, b) => a.startAt.localeCompare(b.startAt)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [range, router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Group items by calendar day (YYYY-MM-DD of startAt).
  const days = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const key = it.startAt.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const monthLabel = dualDate(range.from, locale) ?? '';

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_EVENT);
    setFormError('');
    setOpen(true);
  }

  async function openEdit(item: CalendarItem) {
    if (item.kind !== 'event' || !canUpdate) return;
    try {
      const ev = await apiFetch<CalendarEventResponse>(`/calendar/events/${item.id}`);
      setEditId(ev.id);
      setForm({
        title: ev.title,
        location: ev.location ?? '',
        startAt: toLocalInput(ev.startAt),
        endAt: toLocalInput(ev.endAt),
      });
      setFormError('');
      setOpen(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
      else setError(t('error'));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const body = {
      title: form.title,
      ...(form.location ? { location: form.location } : {}),
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
    };
    try {
      if (editId) {
        await apiFetch(`/calendar/events/${editId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/calendar/events', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editId) return;
    setSaving(true);
    try {
      await apiFetch(`/calendar/events/${editId}`, { method: 'DELETE' });
      setOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  const shiftMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // Deep-linked without the capability: the nav hides the link, a pasted URL does
  // not. A refusal is not a failure, so it replaces the screen and offers no retry.
  if (forbidden) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <NoAccess capability="calendar.read" />
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

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)}>
          {t('prev')}
        </Button>
        <span className="min-w-64 text-sm font-medium">{monthLabel}</span>
        <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>
          {t('next')}
        </Button>
      </div>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={items.length > 0} />
      )}

      <div className="space-y-4">
        {days.map(([day, dayItems]) => (
          <div key={day} className="rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
              {dualDate(`${day}T00:00:00.000Z`, locale)}
            </div>
            <ul className="divide-y">
              {dayItems.map((it) => (
                <li
                  key={`${it.kind}-${it.id}`}
                  className={`flex items-center gap-3 px-4 py-2 text-sm ${it.kind === 'event' && canUpdate ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                  onClick={() => void openEdit(it)}
                >
                  <Badge variant={KIND_VARIANT[it.kind] ?? 'secondary'}>{t(`kind.${it.kind}`)}</Badge>
                  {/* /calendar/view returns raw enums, and uses the GRO process
                      TYPE as the title — so this row used to read
                      "iqama_renewal … · open" in Arabic (UX-09). */}
                  <span className="font-medium">{titleFor(it.kind as ViewItemKind, it.title)}</span>
                  <span className="ms-auto whitespace-nowrap text-xs text-muted-foreground">
                    {it.allDay ? t('due') : timeLabel(it.startAt, it.allDay)}
                    {statusLabel(it.kind as ViewItemKind, it.status)
                      ? ` · ${statusLabel(it.kind as ViewItemKind, it.status)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {loading && days.length === 0 && (
          <SkeletonRegion label={tStates('loading')} className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-lg border bg-card p-4">
                <Skeleton className="mb-3 h-3 w-40" />
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </SkeletonRegion>
        )}
        {days.length === 0 && !loading && <EmptyState variant="first-run" title={t('empty')} />}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? t('editTitle') : t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-title">{t('fieldTitle')}</Label>
              <Input id="c-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-start">{t('fieldStart')}</Label>
                <Input id="c-start" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-end">{t('fieldEnd')}</Label>
                <Input id="c-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-loc">{t('fieldLocation')}</Label>
              <Input id="c-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter className="items-center">
              {editId && canDelete && (
                <Button type="button" variant="ghost" onClick={() => void remove()} disabled={saving}>
                  {t('delete')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.title || !form.startAt || !form.endAt}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
