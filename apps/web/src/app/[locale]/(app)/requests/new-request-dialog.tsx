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

// "New request" (REQ-04's create form, moved out of the page in DS-08 unchanged
// in behaviour). The prototype offers this only on the client view; staff could
// raise requests before the redesign, so the capability is kept.

const TYPES = ['letter', 'certificate', 'document', 'gro_service', 'general'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;

interface CreateForm {
  clientId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
}
const EMPTY: CreateForm = {
  clientId: '',
  type: 'general',
  title: '',
  description: '',
  priority: 'normal',
  dueDate: '',
};

export function NewRequestDialog({
  open,
  onOpenChange,
  clients,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientResponse[];
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('requests');
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState<CreateForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const active = clients.filter((c) => c.status === 'active');
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? (locale === 'ar' ? c.name.ar : c.name.en) : id.slice(0, 8);
  };

  // Reset when the dialog OPENS (not on close — that cleared the form mid-fade,
  // SS-07). Tracked during render: Base UI's onOpenChange fires only for the
  // dialog's own open/close gestures, never when the parent sets `open`, so a
  // reset there never ran (DS-09 found it: no client preselected, stale form).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({ ...EMPTY, clientId: active[0]?.id ?? '' });
      setFormError('');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const created = await apiFetch<{ id: string }>('/requests', {
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
      onOpenChange(false);
      onCreated(created.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
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
            <Label htmlFor="nr-client">{t('fieldClient')}</Label>
            <Select
              value={form.clientId}
              onValueChange={(v) => setForm({ ...form, clientId: v ?? '' })}
            >
              <SelectTrigger id="nr-client" className="w-full">
                <SelectValue placeholder={t('selectClient')}>
                  {(v) => (v ? clientName(String(v)) : t('selectClient'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {active.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {locale === 'ar' ? c.name.ar : c.name.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nr-type">{t('fieldType')}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v ?? 'general' })}
              >
                <SelectTrigger id="nr-type" className="w-full">
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
              <Label htmlFor="nr-priority">{t('fieldPriority')}</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v ?? 'normal' })}
              >
                <SelectTrigger id="nr-priority" className="w-full">
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
            <Label htmlFor="nr-title">{t('fieldTitle')}</Label>
            <Input
              id="nr-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-desc">{t('fieldDescription')}</Label>
            <Textarea
              id="nr-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-due">{t('fieldDue')}</Label>
            <Input
              id="nr-due"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-44"
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !form.clientId || !form.title}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
