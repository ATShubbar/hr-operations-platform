// Wall-clock time in a NAMED timezone ↔ an instant (GCAL-04). A time typed on a
// form (`<input type="datetime-local">` gives "YYYY-MM-DDTHH:mm") means that time
// in the zone CHOSEN on the form — `new Date(value)` would read it in the
// BROWSER's zone instead (the GCAL-04 bug: 10:00 "Asia/Riyadh" from a UTC+4
// browser left as 06:00Z = 09:00 Riyadh). Built on the runtime's own Intl zone
// data — no dependency — and correct across daylight-saving changes:
//   - a wall time that never happens (spring-forward gap) moves FORWARD past it;
//   - a wall time that happens twice (fall-back overlap) is the FIRST occurrence.

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock in `timeZone` at `ms`, read back as if it were UTC (ms). */
function wallAsUtc(ms: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** True when `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The instant at which the clocks in `timeZone` read `wallClock` ("YYYY-MM-DDTHH:mm[:ss]"). */
export function zonedTimeToUtc(wallClock: string, timeZone: string): Date {
  const m = WALL.exec(wallClock);
  if (!m) throw new RangeError(`Not a wall-clock time: ${wallClock}`);
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown timezone: ${timeZone}`);
  const [, y, mo, d, h, mi, s] = m;
  const target = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // Two candidates — the target read with the zone's offset at "target as UTC",
  // then re-read with the offset at that first guess. Across a DST change they
  // differ; whichever reproduces the wall clock is the answer (both in an
  // overlap → the earlier; neither in a gap → the later, i.e. past the gap).
  const offset = (ms: number) => wallAsUtc(ms, timeZone) - ms;
  const first = target - offset(target);
  const second = target - offset(first);
  const exact = [first, second].filter((ms) => wallAsUtc(ms, timeZone) === target);
  return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(first, second));
}

/** `instant` as the wall clock in `timeZone` ("YYYY-MM-DDTHH:mm"), e.g. to fill a form or show it. */
export function utcToZonedWallClock(instant: Date, timeZone: string): string {
  return new Date(wallAsUtc(instant.getTime(), timeZone)).toISOString().slice(0, 16);
}
