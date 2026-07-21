'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClientListResponse, ClientResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
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

type Status = 'active' | 'inactive';
interface FormState {
  id: string | null; // null = create
  nameAr: string;
  nameEn: string;
  status: Status;
}

const EMPTY_FORM: FormState = { id: null, nameAr: '', nameEn: '', status: 'active' };

// Staff clients console (CLIENT-04) over the client.* API (CLIENT-02). List is
// available to all staff; create/edit/archive to admins (a non-admin hitting a
// mutation gets a 403, surfaced as saveError). A 401 means the session lapsed.
export default function ClientsPage() {
  const t = useTranslations('clients');
  const locale = useLocale();
  const router = useRouter();
  const canCreate = useCan('client.create');
  const canUpdate = useCan('client.update');
  const canDelete = useCan('client.delete');

  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<ClientListResponse>('/clients');
      setClients(res.clients);
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
    // Initial load, once on mount.
    void load();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setOpen(true);
  };
  const openEdit = (c: ClientResponse) => {
    setForm({ id: c.id, nameAr: c.name.ar, nameEn: c.name.en, status: c.status });
    setFormError('');
    setOpen(true);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = { name: { ar: form.nameAr, en: form.nameEn }, status: form.status };
    try {
      if (form.id) {
        await apiFetch(`/clients/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/clients', { method: 'POST', body: JSON.stringify(payload) });
      }
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

  async function archive(c: ClientResponse) {
    setError('');
    try {
      await apiFetch(`/clients/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(t('archiveError'));
    }
  }

  const localizedName = (c: ClientResponse) => (locale === 'ar' ? c.name.ar : c.name.en);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canCreate && <Button onClick={openCreate}>{t('new')}</Button>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colName')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              {(canUpdate || canDelete) && (
                <TableHead className="text-end">{t('colActions')}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{localizedName(c)}</TableCell>
                <TableCell>
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                    {c.status === 'active' ? t('statusActive') : t('statusInactive')}
                  </Badge>
                </TableCell>
                {(canUpdate || canDelete) && (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {canUpdate && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                          {t('edit')}
                        </Button>
                      )}
                      {canDelete && c.status === 'active' && (
                        <Button variant="ghost" size="sm" onClick={() => void archive(c)}>
                          {t('archive')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {clients.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={canUpdate || canDelete ? 3 : 2}
                  className="text-center text-sm text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? t('editTitle') : t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">{t('nameEn')}</Label>
              <Input
                id="nameEn"
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameAr">{t('nameAr')}</Label>
              <Input
                id="nameAr"
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('status')}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Status })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('statusActive')}</SelectItem>
                  <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
