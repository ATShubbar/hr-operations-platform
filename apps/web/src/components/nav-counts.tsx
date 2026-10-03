'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RequestListResponse, TaskListResponse } from '@hr/contracts';
import { apiFetch } from '@/lib/api';
import { useCan, useSession } from '@/lib/session';

// Counts beside two nav rows (DS-02): requests waiting to be picked up, and the
// caller's own unfinished tasks. Both come from list endpoints that already
// exist — no API change — and both are the same question the screen itself
// answers, so the number in the nav can never disagree with the screen.
//
// Fetched ONCE per app mount and held here rather than in AppNav: the nav is
// rendered by the sidebar AND, every time it opens, by the mobile sheet, so a
// fetch inside it would repeat on every sheet open. A count that is a few
// minutes stale is fine for a nav hint; the screen is the source of truth.
//
// Failure is SILENT — a missing count is the state "no count", which the nav
// already renders for roles without the permission. An error banner over the
// navigation for a hint would be out of all proportion.

export type NavCounts = { requests?: number; tasks?: number };

const NavCountsContext = createContext<NavCounts>({});

export function useNavCounts(): NavCounts {
  return useContext(NavCountsContext);
}

export function NavCountsProvider({ children }: { children: ReactNode }) {
  const me = useSession();
  // Staff only: client reps hold `request.read` too (they raise requests), but
  // the portal nav has no Requests row, so the count would be fetched for
  // nothing.
  const isStaff = me.principalType === 'staff';
  const canRequests = useCan('request.read') && isStaff;
  const canTasks = useCan('task.read') && isStaff;
  const [counts, setCounts] = useState<NavCounts>({});

  useEffect(() => {
    let cancelled = false;

    // `open` only: a request in progress already has someone on it, so it is
    // not waiting for anyone — counting it would make the number mean "work in
    // the system" rather than "work nobody has taken".
    if (canRequests) {
      apiFetch<RequestListResponse>('/requests?status=open')
        .then((res) => !cancelled && setCounts((c) => ({ ...c, requests: res.requests.length })))
        .catch(() => {});
    }

    // Assigned to me and not finished. One request, filtered here, rather than
    // two (`open` + `in_progress`): the assignee filter already narrows it to a
    // single person's list.
    if (canTasks) {
      apiFetch<TaskListResponse>(`/tasks?assigneeUserId=${me.userId}`)
        .then(
          (res) =>
            !cancelled &&
            setCounts((c) => ({
              ...c,
              tasks: res.tasks.filter((x) => x.status === 'open' || x.status === 'in_progress')
                .length,
            })),
        )
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [canRequests, canTasks, me.userId]);

  return <NavCountsContext.Provider value={counts}>{children}</NavCountsContext.Provider>;
}
