// KSA work week (TASK-01): Sunday–Thursday. Friday (5) and Saturday (6) are the
// weekend. Task due dates are "Sun–Thu aware" — a due date N working days out
// skips the weekend. Computed on UTC date components (tz-stable; due_date is a
// DATE column).
export function isWorkingDay(d: Date): boolean {
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  return day !== 5 && day !== 6;
}

export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) added += 1;
  }
  return d;
}
