import { isFinished } from '@hr/contracts/work-status';
import type {
  ClientResponse,
  EmployeeResponse,
  GroProcessResponse,
  RequestResponse,
} from '@hr/contracts';
import { DOC_TYPES, datedDocs, isSaudi, type DocKey } from '@/lib/employee-docs';

// A client company's figures (DS-10), computed from data the screens already read:
// the employee records (their own document dates — the People rule, shared via
// lib/employee-docs), GRO processes and requests. Nothing is stored or invented.
//
// - Saudi share = Saudis on the register by NATIONALITY. Not the Nitaqat figure,
//   which weights some people differently (the Nitaqat feature will compute that),
//   and the screens label it as what it is.
// - Open items = the company's active GRO processes. Tasks are left out on purpose:
//   they are own-scoped (task.read-all lifts it), so the same company would show a
//   different count to each viewer.
// - Requests waiting = open requests not yet decided.

/**
 * The people under management (DS-17, owner decision): not terminated, AND at a
 * client that is still active. Someone left on an archived client's register is
 * not under management, so they count in no headcount, Saudi share or expiry
 * figure on the Overview or the Reports dashboard.
 */
export function underManagement(
  employees: readonly EmployeeResponse[],
  clients: readonly ClientResponse[],
): EmployeeResponse[] {
  const active = new Set(clients.filter((c) => c.status === 'active').map((c) => c.id));
  return employees.filter((e) => e.employmentStatus !== 'terminated' && active.has(e.clientId));
}

export interface ClientFigures {
  headcount: number;
  saudiPct: number;
  expiring30: number;
  openItems: number;
  waiting: number;
}

export function figuresFor(
  clientId: string,
  employees: readonly EmployeeResponse[],
  processes: readonly GroProcessResponse[],
  requests: readonly RequestResponse[],
): ClientFigures {
  const staff = employees.filter(
    (e) => e.clientId === clientId && e.employmentStatus !== 'terminated',
  );
  const saudis = staff.filter(isSaudi).length;
  return {
    headcount: staff.length,
    saudiPct: staff.length ? Math.round((saudis / staff.length) * 100) : 0,
    expiring30: staff.reduce(
      (n, e) => n + datedDocs(e).filter((d) => d.days >= 0 && d.days <= 30).length,
      0,
    ),
    openItems: processes.filter(
      (p) => p.clientId === clientId && !isFinished('procedure', p.status),
    ).length,
    waiting: requests.filter((r) => r.clientId === clientId && r.status === 'open').length,
  };
}

// The expiry runway: each stored document type × how long is left. `overdue` is an
// addition to the prototype's bands — without it an already-expired document would
// count as "tracked" and appear in no column at all.
export const RUNWAY_BANDS = [
  { key: 'overdue', lo: -Infinity, hi: -1 },
  { key: 'd7', lo: 0, hi: 7 },
  { key: 'd14', lo: 8, hi: 14 },
  { key: 'd30', lo: 15, hi: 30 },
  { key: 'd60', lo: 31, hi: 60 },
  { key: 'd90', lo: 61, hi: 90 },
] as const;
export type RunwayBand = (typeof RUNWAY_BANDS)[number]['key'];

export interface RunwayRow {
  key: DocKey;
  stored: boolean;
  counts: Record<RunwayBand, number>;
  tracked: number;
}

export function runwayFor(staff: readonly EmployeeResponse[]): RunwayRow[] {
  return DOC_TYPES.map((def) => {
    const days = staff.flatMap((e) =>
      datedDocs(e)
        .filter((d) => d.key === def.key)
        .map((d) => d.days),
    );
    const counts = Object.fromEntries(
      RUNWAY_BANDS.map((b) => [b.key, days.filter((n) => n >= b.lo && n <= b.hi).length]),
    ) as Record<RunwayBand, number>;
    return { key: def.key, stored: !!def.date, counts, tracked: days.length };
  });
}
