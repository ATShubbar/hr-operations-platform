import { z } from 'zod';
import type { SettingLevel } from '@hr/contracts';

// The settings CATALOG (CONF-01; architecture.md §Localization) — the single
// source of truth for what every setting is: which of the three levels
// (system / client / user) may hold a value, how a value is validated, and the
// coded system default. Modules read settings through the Configuration
// service; the catalog is what makes "override a level a setting doesn't
// permit" a Configuration error rather than a silent fallback.
//
// Levels here declare CAPABILITY, not storage: 'system' is always present (the
// only level that exists for every setting). CONF-02/03 add resolution for the
// 'client' and 'user' levels a setting opts into — the declarations live here
// so those cards are pure additive resolution layers.

export interface SettingDef {
  readonly key: string;
  readonly schema: z.ZodTypeAny;
  readonly default: unknown;
  readonly levels: readonly SettingLevel[];
  readonly description: string;
}

// Sunday=0 … Saturday=6 (JS getDay convention), so the Saudi Sun–Thu week is
// [0,1,2,3,4]. Stored as an explicit weekday set so any GCC working week is a
// configuration change, not code (architecture.md Localization table).
const weekdaySetSchema = z.array(z.number().int().min(0).max(6)).min(1).max(7);

// IANA timezone id. Validated by asking the runtime's Intl whether it accepts
// the zone — no hardcoded list, and no bad zone reaches storage.
const ianaTimezoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Not a valid IANA timezone' },
);

const localeSchema = z.enum(['ar', 'en']);

const DEFS: readonly SettingDef[] = [
  {
    key: 'calendar.display',
    schema: z.enum(['hijri', 'gregorian', 'dual']),
    default: 'dual',
    levels: ['system', 'client'],
    description: 'Which calendar dates render in — Hijri (Umm al-Qura), Gregorian, or dual.',
  },
  {
    key: 'working.week',
    schema: weekdaySetSchema,
    default: [0, 1, 2, 3, 4],
    levels: ['system', 'client'],
    description: 'Working weekdays (0=Sunday … 6=Saturday); affects calendar, SLAs, due dates.',
  },
  {
    key: 'timezone',
    schema: ianaTimezoneSchema,
    default: 'Asia/Riyadh',
    levels: ['system', 'client'],
    description: 'IANA timezone for date/time rendering and scheduling.',
  },
  {
    key: 'ui.languages',
    schema: z.array(localeSchema).min(1),
    default: ['ar', 'en'],
    levels: ['system'],
    description: 'The set of UI languages this deployment offers.',
  },
  {
    key: 'ui.language',
    schema: localeSchema,
    default: 'ar',
    levels: ['system', 'user'],
    description: 'Default UI language; a user may override their own.',
  },
] as const;

const BY_KEY: ReadonlyMap<string, SettingDef> = new Map(DEFS.map((d) => [d.key, d]));

export const CATALOG: readonly SettingDef[] = DEFS;

export function getSettingDef(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

export function settingAllowsLevel(def: SettingDef, level: SettingLevel): boolean {
  return def.levels.includes(level);
}
