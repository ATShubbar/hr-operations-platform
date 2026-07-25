import type { ReportCell, ReportResult } from './report-result';

// CSV rendering of a report (REP-03). Because every report shares one table
// shape, this is a single fold over columns × rows — no per-report code, which
// is exactly why REP-01 chose that shape.
//
// RFC 4180: CRLF line endings, fields quoted only when they need to be, embedded
// quotes doubled. A UTF-8 BOM is prepended so Excel opens Arabic client names as
// Arabic rather than mojibake — the platform is bilingual and an export that
// mangles Arabic is not usable in Riyadh.

const BOM = '﻿';
const CRLF = '\r\n';
const NEEDS_QUOTING = /[",\r\n]/;

export function toCsv(result: ReportResult): string {
  const lines: string[] = [];
  lines.push(result.columns.map((c) => field(c.label)).join(','));
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => field(row[c.key] ?? null)).join(','));
  }

  // The whole-report totals travel WITH the table — a spreadsheet that loses the
  // summary invites someone to re-derive it by hand and get it wrong. Separated
  // by a blank line so the table above stays a clean rectangle.
  const summary = Object.entries(result.summary);
  if (summary.length > 0) {
    lines.push('');
    lines.push('Summary,Value');
    for (const [key, value] of summary) lines.push(`${field(key)},${field(value)}`);
  }

  return BOM + lines.join(CRLF) + CRLF;
}

// The download filename: report id + the run's date, so a folder of exports
// sorts and reads sensibly.
export function csvFileName(result: ReportResult): string {
  return `${result.id}-${result.generatedAt.slice(0, 10)}.csv`;
}

function field(value: ReportCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  return NEEDS_QUOTING.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
