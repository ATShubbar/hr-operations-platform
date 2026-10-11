// RFC 4180 CSV for every export (REP-03 reports, AUDIT-07 the audit trail): CRLF
// line endings, a field quoted only when it needs to be, embedded quotes doubled
// — and a UTF-8 BOM so Excel opens Arabic as Arabic, not mojibake. Lifted out of
// Reporting (AUDIT-07) so the foundation's audit export doesn't import a delivery
// module.

export type CsvCell = string | number | null;

const BOM = '﻿';
const CRLF = '\r\n';
const NEEDS_QUOTING = /[",\r\n]/;

export function csvField(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  return NEEDS_QUOTING.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Text typed by a person, made safe for a spreadsheet (SOON-01). A cell that
 * opens with = + - or @ is run as a FORMULA by Excel and Sheets, so a name such
 * as `=HYPERLINK(...)` would execute on whoever opens the file. A leading
 * apostrophe makes the program show it as text. Used for the register export;
 * the report and audit exports predate it (follow-up CSV-01).
 */
export function csvText(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Lines of cells → one CSV document (BOM + CRLF lines + a final CRLF). An empty line is a blank row. */
export function toCsvDocument(lines: readonly (readonly CsvCell[])[]): string {
  return BOM + lines.map((cells) => cells.map(csvField).join(',')).join(CRLF) + CRLF;
}
