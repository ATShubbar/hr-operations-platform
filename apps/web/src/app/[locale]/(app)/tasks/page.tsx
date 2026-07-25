'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientListResponse,
  ClientResponse,
  TaskListResponse,
  TaskResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan, useSession } from '@/lib/session';
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
import { StatusPill } from '@/components/ui/status-pill';
import { useStaffDirectory } from '@/lib/staff-directory';
import { toneFor } from '@/lib/status-tone';

const STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;
const ALL = 'all';
const NO_CLIENT = 'none';

interface EditForm {
  status: string;
  priority: string;
}
interface CreateForm {
  clientId: string;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
}
const EMPTY_CREATE: CreateForm = {
  clientId: NO_CLIENT,
  title: '',
  description: '',
  priority: 'normal',
  dueDate: '',
};

// Tasks console (TASK-04) over the task.* API (TASK-02). Internal work items,
// staff-only; the API scopes non-admins to their own/assigned tasks (task.read-all
// lifts that). Create needs task.create; Edit / Assign-to-me need task.update —
// hidden without the capability. Some tasks are spawned from requests (TASK-03).
export default function TasksPage() {
  const t = useTranslations('tasks');
  const { nameFor } = useStaffDirectory();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const me = useSession().userId;
  const canCreate = useCan('task.create');
  const canUpdate = useCan('task.update');

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const [fStatus, setFStatus] = useState(ALL);
  const [fClient, setFClient] = useState(ALL);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editTarget, setEditTarget] = useState<TaskResponse | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ status: 'open', priority: 'normal' });
  const [editSaving, setEditSaving] = useState(false);

  const clientName = (id: string | null) => {
    if (!id) return t('none');
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

  async function load(filters?: { status: string; client: string }) {
    const f = filters ?? { status: fStatus, client: fClient };
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (f.status !== ALL) params.set('status', f.status);
      if (f.client !== ALL) params.set('clientId', f.client);
      const qs = params.toString();
      const res = await apiFetch<TaskListResponse>(`/tasks${qs ? `?${qs}` : ''}`);
      setTasks(res.tasks);
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
    setFStatus(ALL);
    setFClient(ALL);
    void load({ status: ALL, client: ALL });
  };

  function openCreate() {
    setForm(EMPTY_CREATE);
    setFormError('');
    setOpen(true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
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
      setOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    }
  }

  function openEdit(task: TaskResponse) {
    setEditTarget(task);
    setEditForm({ status: task.status, priority: task.priority });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await apiFetch(`/tasks/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: editForm.status, priority: editForm.priority }),
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('saveError'));
    } finally {
      setEditSaving(false);
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
        <NoAccess capability="task.read" />
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
        <Button type="submit" disabled={loading}>
          {t('apply')}
        </Button>
        <Button type="button" variant="outline" onClick={onClear} disabled={loading}>
          {t('clear')}
        </Button>
      </form>

      {error && (
        <LoadError message={error} onRetry={() => void load()} hasContent={tasks.length > 0} />
      )}

      <DataTable
        rows={tasks}
        loading={loading}
        rowKey={(task) => task.id}
        searchPlaceholder={t('searchPlaceholder')}
        initialSort={{ key: 'due', dir: 'asc' }}
        emptyTitle={t('empty')}
        filtersActive={fStatus !== ALL || fClient !== ALL}
        onClearFilters={onClear}
        columns={[
          {
            key: 'title',
            header: t('colTitle'),
            sortValue: (task) => task.title,
            searchValues: (task) => [task.title, task.description],
            cell: (task) => (
              <span className="font-medium">
                {task.title}
                {task.requestId && (
                  <span className="ms-2 text-xs text-muted-foreground">({t('fromRequest')})</span>
                )}
              </span>
            ),
          },
          {
            key: 'client',
            header: t('colClient'),
            sortValue: (task) => clientName(task.clientId),
            searchValues: (task) => [clientName(task.clientId)],
            cell: (task) => (
              <span className="text-sm text-muted-foreground">{clientName(task.clientId)}</span>
            ),
          },
          {
            key: 'status',
            header: t('colStatus'),
            sortValue: (task) => task.status,
            cell: (task) => (
              <StatusPill tone={toneFor('task', task.status)}>
                {t(`status.${task.status}`)}
              </StatusPill>
            ),
          },
          {
            key: 'priority',
            header: t('colPriority'),
            sortValue: (task) => task.priority,
            cell: (task) => t(`priority.${task.priority}`),
          },
          {
            key: 'assignee',
            header: t('colAssignee'),
            sortValue: (task) => task.assigneeUserId ?? '',
            cell: (task) => (
              <span className="text-sm text-muted-foreground">
                {task.assigneeUserId
                  ? task.assigneeUserId === me
                    ? t('assigned')
                    : // Was a truncated UUID (UX-10b).
                      nameFor(task.assigneeUserId)
                  : t('unassigned')}
              </span>
            ),
          },
          {
            key: 'due',
            header: t('colDue'),
            sortValue: (task) => task.dueDate,
            cell: (task) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {dualDate(task.dueDate, locale) ?? t('none')}
              </span>
            ),
          },
        ]}
        actions={
          canUpdate
            ? (task) => (
                <div className="flex justify-end gap-2">
                  {task.assigneeUserId !== me && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void patch(task.id, { assigneeUserId: me })}
                    >
                      {t('assignToMe')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openEdit(task)}>
                    {t('edit')}
                  </Button>
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
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.title}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="text-sm font-medium">{editTarget.title}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('fieldStatus')}</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) => setEditForm({ ...editForm, status: v ?? 'open' })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v) => t(`status.${String(v)}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`status.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fieldPriority')}</Label>
                  <Select
                    value={editForm.priority}
                    onValueChange={(v) => setEditForm({ ...editForm, priority: v ?? 'normal' })}
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving ? t('saving') : t('submit')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
