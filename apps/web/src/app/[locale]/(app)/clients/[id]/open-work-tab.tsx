'use client';

import { isFinished } from '@hr/contracts/work-status';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ListChecks } from 'lucide-react';
import type {
  EmployeeResponse,
  GroProcessResponse,
  TaskListResponse,
  TaskResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useStaffDirectory } from '@/lib/staff-directory';
import { Button } from '@/components/ui/button';
import { DueCell, isOpenProcedure, GroWorkRows, byDue } from '@/components/gro-work-list';
import { toastSuccess } from '@/components/ui/toast';

// The Client record's Open work tab (DS-11): what is still open against this
// company — its people's government procedures and the internal tasks linked to
// it. Requests have their own tab.
//
// Procedures are the Person record's rows (components/gro-work-list.tsx) for the
// whole company, with the person named on each. Tasks are listed as the viewer
// can see them (owner decision): task.read-all holders see every task, everyone
// else only their own or assigned ones — the Tasks screen's rule — and the tab
// says so, so a shorter list does not read as missing work. The Overview's Open
// items tile stays procedures-only, the same number for everyone.

export function OpenWorkTab({
  clientId,
  processes,
  employees,
  onChanged,
}: {
  clientId: string;
  processes: readonly GroProcessResponse[];
  employees: readonly EmployeeResponse[];
  /** A procedure moved on — the record reloads its figures. */
  onChanged: () => Promise<void> | void;
}) {
  const t = useTranslations('clients');
  const tt = useTranslations('tasks');
  const locale = useLocale();
  const router = useRouter();
  const canUpdateTask = useCan('task.update');
  const canReadAll = useCan('task.read-all');
  const { nameFor } = useStaffDirectory();

  const [tasks, setTasks] = useState<TaskResponse[] | null>(null);
  const [taskError, setTaskError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function loadTasks() {
    try {
      const res = await apiFetch<TaskListResponse>(`/tasks?clientId=${clientId}`);
      setTasks(res.tasks.filter((x) => !isFinished('task', x.status)).sort(byDue));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setTasks([]);
      setTaskError(t('workError'));
    }
  }
  useEffect(() => {
    void loadTasks();
  }, [clientId]);

  async function markDone(task: TaskResponse) {
    setBusy(task.id);
    setTaskError('');
    try {
      await apiFetch(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      });
      await loadTasks();
      toastSuccess(t('taskDone', { title: task.title }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setTaskError(t('workError'));
    } finally {
      setBusy(null);
    }
  }

  const procedures = processes.filter((p) => isOpenProcedure(p.status)).sort(byDue);
  const person = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? (locale === 'ar' ? e.name.ar : e.name.en) : null;
  };
  const empty = procedures.length === 0 && tasks !== null && tasks.length === 0;

  return (
    <section
      aria-labelledby="client-work"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5 px-5 py-4">
        <h2 id="client-work" className="text-base leading-6 font-medium">
          {t('workTitle')}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{t('workHint')}</p>
      </div>

      {empty ? (
        <p className="border-t px-5 py-7 text-center text-[13px] leading-[18px] text-neutral-400">
          {t('workEmpty')}
        </p>
      ) : (
        <>
          {procedures.length > 0 && (
            <div className="border-t">
              <h3 className="bg-neutral-50 px-4 py-1.5 text-[11px] leading-4 font-medium text-muted-foreground uppercase shadow-[inset_0_-1px_0_var(--border)] ltr:tracking-[0.05em]">
                {t('workProcedures', { count: procedures.length })}
              </h3>
              <GroWorkRows
                items={procedures}
                personOf={(p) => person(p.employeeId)}
                onChanged={onChanged}
              />
            </div>
          )}
          {tasks && tasks.length > 0 && (
            <div className="border-t">
              <h3 className="bg-neutral-50 px-4 py-1.5 text-[11px] leading-4 font-medium text-muted-foreground uppercase shadow-[inset_0_-1px_0_var(--border)] ltr:tracking-[0.05em]">
                {t('workTasks', { count: tasks.length })}
              </h3>
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--border)] sm:flex-nowrap"
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                    <ListChecks className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 grow flex-col gap-px">
                    <span className="truncate text-sm leading-5 font-medium">{task.title}</span>
                    <span className="truncate text-xs leading-4 text-muted-foreground">
                      {[
                        task.assigneeUserId ? nameFor(task.assigneeUserId) : tt('unassigned'),
                        tt(`status.${task.status}`),
                      ].join(' · ')}
                    </span>
                  </span>
                  <DueCell iso={task.dueDate} />
                  {canUpdateTask && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="w-32 shrink-0"
                      disabled={busy === task.id}
                      onClick={() => void markDone(task)}
                    >
                      {t('markDone')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {taskError && (
        <p role="alert" className="border-t px-4 py-2 text-sm text-destructive">
          {taskError}
        </p>
      )}
      {!canReadAll && (
        <p className="border-t bg-neutral-50 px-4 py-2.5 text-xs leading-4 text-muted-foreground">
          {t('tasksOwnNote')}
        </p>
      )}
    </section>
  );
}
