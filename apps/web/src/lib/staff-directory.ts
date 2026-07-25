'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StaffDirectoryResponse } from '@hr/contracts';
import { apiFetch } from '@/lib/api';

// Staff name resolution (UX-10b).
//
// Tasks showed `a1b2c3d4` where an assignee's name belongs, and the audit log
// showed the same for the actor. Both had the id and no way to turn it into a
// person, because nothing listed staff users.
//
// This reads `/staff-users/directory` — the narrow endpoint that returns id +
// display name + role and nothing else, held by every staff role. The broad
// management API (`/staff-users`) is admin-only and is NOT what a task row
// should be reaching for.
//
// Failure is silent on purpose: a directory that cannot be fetched should degrade
// to the id, not take down the screen that merely wanted to label a row.

export function useStaffDirectory(): {
  nameFor: (id: string | null | undefined) => string | null;
  loaded: boolean;
} {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<StaffDirectoryResponse>('/staff-users/directory')
      .then((res) => {
        if (!active) return;
        setNames(
          new Map(
            res.users
              .filter((u): u is typeof u & { displayName: string } => Boolean(u.displayName))
              .map((u) => [u.id, u.displayName]),
          ),
        );
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Falls back to a short id — the previous behaviour — for a user with no name
  // set, or before the directory arrives.
  const nameFor = useCallback(
    (id: string | null | undefined): string | null => {
      if (!id) return null;
      return names.get(id) ?? id.slice(0, 8);
    },
    [names],
  );

  return { nameFor, loaded };
}
