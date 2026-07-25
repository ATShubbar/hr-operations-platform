import type { ReportId } from './report-catalog';

// The shape EVERY report produces (REP-01). One generic table — columns, rows,
// summary — rather than six bespoke payloads, because the two consumers of a
// report are generic: CSV export (REP-03) is a fold over columns × rows, and the
// web table (REP-04) renders any report without per-report code.
//
// `column.key` is also the i18n lookup key on the web side
// (`reports.column.<key>`); `column.label` is the plain-English CSV header, so
// an export is readable without the app.

export type ReportCell = string | number | null;

export interface ReportColumn {
  readonly key: string;
  readonly label: string;
  // Numeric columns right-align in the UI and are never quoted in CSV.
  readonly numeric: boolean;
}

export type ReportRow = Record<string, ReportCell>;

export interface ReportResult {
  readonly id: ReportId;
  // ISO timestamp of the run — v1 reports are transactional queries against the
  // primary, so this is "as of now", not a snapshot date.
  readonly generatedAt: string;
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly ReportRow[];
  // Whole-report totals, rendered above the table and appended to exports.
  readonly summary: Readonly<Record<string, number>>;
}

export function text(key: string, label: string): ReportColumn {
  return { key, label, numeric: false };
}

export function count(key: string, label: string): ReportColumn {
  return { key, label, numeric: true };
}
