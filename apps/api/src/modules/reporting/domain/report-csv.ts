import { toCsvDocument, type CsvCell } from '../../../csv/csv';
import type { ReportResult } from './report-result';

// CSV rendering of a report (REP-03). Because every report shares one table
// shape, this is a single fold over columns × rows — no per-report code, which
// is exactly why REP-01 chose that shape. The RFC 4180 / BOM rules are the shared
// `src/csv` (AUDIT-07), so the audit export writes the same format.

export function toCsv(result: ReportResult): string {
  const lines: CsvCell[][] = [];
  lines.push(result.columns.map((c) => c.label));
  for (const row of result.rows) lines.push(result.columns.map((c) => row[c.key] ?? null));

  // The whole-report totals travel WITH the table — a spreadsheet that loses the
  // summary invites someone to re-derive it by hand and get it wrong. Separated
  // by a blank line so the table above stays a clean rectangle.
  const summary = Object.entries(result.summary);
  if (summary.length > 0) {
    lines.push([]);
    lines.push(['Summary', 'Value']);
    for (const [key, value] of summary) lines.push([key, value]);
  }
  return toCsvDocument(lines);
}

// The download filename: report id + the run's date, so a folder of exports
// sorts and reads sensibly.
export function csvFileName(result: ReportResult): string {
  return `${result.id}-${result.generatedAt.slice(0, 10)}.csv`;
}
