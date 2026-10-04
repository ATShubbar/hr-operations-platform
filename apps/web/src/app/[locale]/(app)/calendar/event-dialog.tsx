'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { CalendarEventResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
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
import { toastSuccess } from '@/components/ui/toast';

// New / edit event (CAL-03's form, moved out in DS-14 so the selected day can
// prefill it: "Schedule on this day" opens it at 09:00–10:00 on that date).

interface Form {
  title: string;
  location: string;
  startAt: string; // datetime-local value
  endAt: string;
}

// ISO → the value a <input type="datetime-local"> expects (local, no seconds/TZ).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the dialog is for: a new event on a day, or an existing event. */
export type EventTarget =
  { mode: 'new'; day: string } | { mode: 'edit'; event: CalendarEventResponse };

export function EventDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EventTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('calendar');
  const router = useRouter();
  const canDelete = useCan('calendar.delete');
  const [form, setForm] = useState<Form>({ title: '', location: '', startAt: '', endAt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset whenever a new target arrives, tracked during render (DS-09: Base UI's
  // onOpenChange never fires for a parent-set open).
  const [seen, setSeen] = useState<EventTarget | null>(null);
  if (target !== seen) {
    setSeen(target);
    if (target?.mode === 'new') {
      setForm({
        title: '',
        location: '',
        startAt: `${target.day}T09:00`,
        endAt: `${target.day}T10:00`,
      });
    } else if (target?.mode === 'edit') {
      const e = target.event;
      setForm({
        title: e.title,
        location: e.location ?? '',
        startAt: toLocalInput(e.startAt),
        endAt: toLocalInput(e.endAt),
      });
    }
    setError('');
  }

  const editId = target?.mode === 'edit' ? target.event.id : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      title: form.title,
      ...(form.location ? { location: form.location } : {}),
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
    };
    try {
      await apiFetch(editId ? `/calendar/events/${editId}` : '/calendar/events', {
        method: editId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onClose();
      onSaved();
      toastSuccess(editId ? t('saved') : t('created', { title: form.title }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editId) return;
    setSaving(true);
    try {
      await apiFetch(`/calendar/events/${editId}`, { method: 'DELETE' });
      onClose();
      onSaved();
      toastSuccess(t('deleted'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editId ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-title">{t('fieldTitle')}</Label>
            <Input
              id="c-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-start">{t('fieldStart')}</Label>
              <Input
                id="c-start"
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-end">{t('fieldEnd')}</Label>
              <Input
                id="c-end"
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-loc">{t('fieldLocation')}</Label>
            <Input
              id="c-loc"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="items-center">
            {editId && canDelete && (
              <Button type="button" variant="ghost" onClick={() => void remove()} disabled={saving}>
                {t('delete')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !form.title || !form.startAt || !form.endAt}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
