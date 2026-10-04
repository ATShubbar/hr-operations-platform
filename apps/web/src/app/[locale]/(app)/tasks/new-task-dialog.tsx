'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// "New task" (TASK-04's create form, moved out of the Tasks page in DS-12 so the
// Work queue's header can open the same form).

const PRIORITIES = ['low', 'normal', 'high'] as const;
const NO_CLIENT = 'none';

interface Form {
  clientId: string;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
}
const EMPTY: Form = {
  clientId: NO_CLIENT,
  title: '',
  description: '',
  priority: 'normal',
  dueDate: '',
};

export function NewTaskDialog({
  open,
  onOpenChange,
  clients,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: readonly ClientResponse[];
  onCreated: () => void;
}) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : id.slice(0, 8);
  };

  // Reset when the dialog OPENS, tracked during render — Base UI's onOpenChange
  // never fires when the parent sets `open` (DS-09).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY);
      setError('');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...(form.clientId !== NO_CLIENT ? { clientId: form.clientId } : {}),
          title: form.title,
          ...(form.description ? { description: form.description } : {}),
          priority: form.priority,
          ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        }),
      });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tk-title">{t('fieldTitle')}</Label>
            <Input
              id="tk-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('fieldClient')}</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => setForm({ ...form, clientId: v ?? NO_CLIENT })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => (v && v !== NO_CLIENT ? clientName(String(v)) : t('selectClient'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>{t('selectClient')}</SelectItem>
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
            <Label htmlFor="tk-desc">{t('fieldDescription')}</Label>
            <Textarea
              id="tk-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-due">{t('fieldDue')}</Label>
            <Input
              id="tk-due"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-44"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !form.title}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
