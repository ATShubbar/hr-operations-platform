'use client';

import { isFinished } from '@hr/contracts/work-status';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ClientResponse,
  EmployeeResponse,
  GroProcessResponse,
  RequestResponse,
  SequenceInFlight,
  TaskResponse,
} from '@hr/contracts';
import type { QueueItem } from './queue-actions';
import { procedureTitle } from '@/lib/procedure-title';

// Open work as one list (DS-12; shared with the Overview in DS-17, so the two
// screens can't disagree about what is open or in what order).
//
// Open means NOT finished by the one shared definition (CAL-04): procedures not
// completed / cancelled (a rejected one is still open), requests not resolved /
// closed / cancelled (info needed is open), tasks not done / cancelled. Order: soonest due
// first, no due date last; ties go to whichever was opened first — the
// prototype's "by statutory deadline, then by how long the file has been open".
//
// Finished (DS-22b, the queue's history view, absorbing the GRO and Task
// history screens): procedures completed / cancelled, requests resolved /
// closed / cancelled, tasks done / cancelled — newest-finished first. Nothing
// records WHEN work finished, so `finishedAt` is the last update (the DS-17
// "cleared today" approximation).

export type QueueView = 'open' | 'finished';

// Open = NOT finished, finished = finished — the ONE shared definition (CAL-04,
// @hr/contracts/work-status), the same the calendar, reports and overviews use.

export interface WorkSources {
  processes: readonly GroProcessResponse[];
  requests: readonly RequestResponse[];
  tasks: readonly TaskResponse[];
  employees: readonly EmployeeResponse[];
  clients: readonly ClientResponse[];
  /** Running onboardings / final exits (MOB-06b); omitted = the viewer has none to see. */
  sequences?: readonly SequenceInFlight[];
}

export function useQueueItems(
  { processes, requests, tasks, employees, clients, sequences }: WorkSources,
  view: QueueView = 'open',
): QueueItem[] {
  const tm = useTranslations('person.mob');
  const tg = useTranslations('gro');
  const tr = useTranslations('requests');
  const tt = useTranslations('tasks');
  const locale = useLocale();

  return useMemo(() => {
    const clientName = (id: string | null) => {
      if (!id) return null;
      const c = clients.find((x) => x.id === id);
      return c ? (locale === 'ar' ? c.name.ar : c.name.en) : null;
    };
    const personOf = (id: string) => {
      const e = employees.find((x) => x.id === id);
      return e ? { name: locale === 'ar' ? e.name.ar : e.name.en, ar: e.name.ar } : null;
    };

    const items: QueueItem[] = [];
    for (const p of processes.filter((x) =>
      view === 'open' ? !isFinished('procedure', x.status) : isFinished('procedure', x.status),
    )) {
      const person = personOf(p.employeeId);
      items.push({
        kind: 'procedure',
        id: p.id,
        title: procedureTitle(p, (ty) => tg(`type.${ty}`), locale),
        ref: p.referenceNumber,
        meta: [person?.name, clientName(p.clientId), tg(`status.${p.status}`)]
          .filter(Boolean)
          .join(' · '),
        clientId: p.clientId,
        clientName: clientName(p.clientId),
        person,
        due: p.dueDate,
        createdAt: p.createdAt,
        finishedAt: view === 'finished' ? p.updatedAt : null,
        assigneeUserId: p.assigneeUserId,
        recordHref: `/employees/${p.employeeId}`,
        gro: p,
        searchText: [
          tg(`type.${p.type}`),
          p.referenceNumber ?? '',
          person?.name ?? '',
          // DEP-06: a dependant procedure is findable by the dependant's name.
          p.dependant?.nameEn ?? '',
          p.dependant?.nameAr ?? '',
        ],
      });
    }
    for (const q of requests.filter((x) =>
      view === 'open' ? !isFinished('request', x.status) : isFinished('request', x.status),
    )) {
      items.push({
        kind: 'request',
        id: q.id,
        title: q.title,
        ref: `#${q.id.slice(0, 8).toUpperCase()}`,
        meta: [
          q.requester?.name,
          clientName(q.clientId),
          tr(`type.${q.type}`),
          tr(`status.${q.status}`),
        ]
          .filter(Boolean)
          .join(' · '),
        clientId: q.clientId,
        clientName: clientName(q.clientId),
        person: q.requester?.name ? { name: q.requester.name, ar: null } : null,
        due: q.dueDate,
        createdAt: q.createdAt,
        finishedAt: view === 'finished' ? q.updatedAt : null,
        assigneeUserId: q.assigneeUserId,
        recordHref: `/requests?r=${q.id}`,
        request: q,
        searchText: [q.title, q.requester?.name ?? '', q.id],
      });
    }
    for (const k of tasks.filter((x) =>
      view === 'open' ? !isFinished('task', x.status) : isFinished('task', x.status),
    )) {
      items.push({
        kind: 'task',
        id: k.id,
        title: k.title,
        ref: null,
        meta: [clientName(k.clientId), tt(`priority.${k.priority}`), tt(`status.${k.status}`)]
          .filter(Boolean)
          .join(' · '),
        clientId: k.clientId,
        clientName: clientName(k.clientId),
        person: null,
        due: k.dueDate,
        createdAt: k.createdAt,
        finishedAt: view === 'finished' ? k.updatedAt : null,
        assigneeUserId: k.assigneeUserId,
        recordHref: null,
        task: k,
        searchText: [k.title],
      });
    }
    // MOB-06b: each READY step of a running sequence is open work, due on its
    // target date and owned by its run's owner. Blocked steps cannot be acted on
    // yet; filed ones are the sequence's history, shown on the Mobilisation tab
    // — so the Finished view has none.
    if (view === 'open') {
      for (const run of sequences ?? []) {
        if (run.status !== 'running') continue;
        const person = {
          name: locale === 'ar' ? run.employee.name.ar : run.employee.name.en,
          ar: run.employee.name.ar,
        };
        for (const st of run.steps) {
          if (st.state !== 'ready') continue;
          const title = tm(`step.${st.key}.title`);
          items.push({
            kind: 'step',
            id: `${run.id}:${st.key}`,
            title,
            ref: null,
            meta: [person.name, clientName(run.clientId), tm(`kind.${run.kind}.label`)]
              .filter(Boolean)
              .join(' · '),
            clientId: run.clientId,
            clientName: clientName(run.clientId),
            person,
            due: st.target,
            createdAt: run.startedOn,
            finishedAt: null,
            assigneeUserId: run.assigneeUserId,
            recordHref: `/employees/${run.employee.id}?tab=mob`,
            step: { sequenceId: run.id, key: st.key, sequenceKind: run.kind },
            searchText: [title, person.name, run.employee.name.ar, st.portal],
          });
        }
      }
    }
    if (view === 'finished') {
      return items.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    }
    return items.sort(
      (a, b) =>
        (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt),
    );
    // tg/tr/tt change with the locale, which is listed.
  }, [processes, requests, tasks, employees, clients, sequences, locale, view]);
}
